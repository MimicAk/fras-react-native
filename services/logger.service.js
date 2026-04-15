import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import DeviceInfo from 'react-native-device-info';
import { LogLevel } from '@bugfender/rn-bugfender';

import { connectToDatabase } from '../database/connection';
import { createLoggerTable } from '../database/schema';
import {
  insertLogsBatch,
  getUnsyncedLogs,
  markLogsSynced,
  rotateLogs,
} from '../database/logger.repository';
import { config } from '../config/config';
import Logger from './bugfender.service';

/* ======================================================
   INTERNAL STATE
====================================================== */

let logQueue = [];
let flushInterval = null;
let syncInterval = null;
let netInfoUnsubscribe = null;
let isFlushing = false;
let isSyncing = false;

/* ======================================================
   DEVICE SNAPSHOT
====================================================== */

/**
 * Captures the current device state for telemetry.
 * @returns {Promise<Object>} Device metrics payload
 */
export const getDeviceSnapshot = async () => {
  try {
    const [
      model,
      systemName,
      systemVersion,
      appVersion,
      batteryLevel,
      isCharging,
      totalMemory,
      freeMemory,
    ] = await Promise.all([
      DeviceInfo.getModel(),
      DeviceInfo.getSystemName(),
      DeviceInfo.getSystemVersion(),
      DeviceInfo.getVersion(),
      DeviceInfo.getBatteryLevel(),
      DeviceInfo.isBatteryCharging(),
      DeviceInfo.getTotalMemory(),
      DeviceInfo.getFreeMemory(),
    ]);

    const netState = await NetInfo.fetch();

    const totalMB = Math.round(totalMemory / (1024 * 1024));
    const freeMB = Math.round(freeMemory / (1024 * 1024));
    const usedMB = totalMB - freeMB;

    return {
      model,
      os: `${systemName} ${systemVersion}`,
      app_version: appVersion,
      battery_level: Math.round(batteryLevel * 100),
      charging: isCharging,
      ram_total_mb: totalMB,
      ram_used_mb: usedMB,
      ram_free_mb: freeMB,
      network: netState.isConnected ? 'online' : 'offline',
      runtime: {
        current_api: null,
        current_query: null,
      },
    };
  } catch (error) {
    return {
      error: 'snapshot_failed',
      runtime: {}, // Ensure runtime exists to prevent TypeErrors later
    };
  }
};

/* ======================================================
   SESSION MANAGEMENT
====================================================== */

/**
 * Initializes a new logging session with a unique ID.
 * @param {string} actionType - The category of the event (e.g., 'check_in_attempt')
 * @param {Object} deviceSnapshot - The snapshot payload generated from getDeviceSnapshot()
 * @returns {Object} The active session object
 */
export const createLogSession = (actionType, deviceSnapshot) => {
  return {
    session_id: `${Date.now()}_${uuidv4().substring(0, 8)}`,
    action_type: actionType,
    event_time: new Date().toISOString(),
    log_payload: {
      device: deviceSnapshot,
    },
  };
};

/**
 * Safely appends data chunks to an active session.
 * @param {Object} session - The active session object
 * @param {string} sectionKey - The key to store the data under
 * @param {any} data - The data to store
 */
export const appendToLogSession = (session, sectionKey, data) => {
  if (!session?.log_payload) return;
  session.log_payload[sectionKey] = data;
};

/**
 * Maps an action_type string to a Bugfender LogLevel.
 * @param {string} actionType
 * @returns {LogLevel}
 */
const resolveBugfenderLevel = actionType => {
  if (actionType.includes('error')) return LogLevel.Error;
  if (
    actionType.includes('no_match') ||
    actionType.includes('already_') ||
    actionType.includes('blocked') ||
    actionType.includes('not_found')
  )
    return LogLevel.Warning;
  if (actionType.includes('attempt')) return LogLevel.Debug;
  return LogLevel.Info;
};

/**
 * Moves an active session into the background queue to be saved,
 * and mirrors the event to the Bugfender dashboard.
 * @param {Object} session - The active session to close and queue
 */
export const finalizeLogSession = session => {
  if (!session) return;
  logQueue.push(session);

  // Mirror to Bugfender — strip the verbose device snapshot since
  // Bugfender already captures device context via its own SDK.
  try {
    const { device, ...eventData } = session.log_payload || {};
    Logger.sendLog({
      tag: session.action_type,
      text: JSON.stringify(eventData),
      level: resolveBugfenderLevel(session.action_type),
      line: 0,
      method: 'logEvent',
      file: 'attendance',
    });
  } catch (_) {}
};

/* ======================================================
   DATABASE FLUSHING (BACKGROUND)
====================================================== */

/**
 * Drains the memory queue and saves logs to the SQLite database.
 * Converts payloads to strings to prevent SQLite object constraint failures.
 */
const flushLogsToDB = async () => {
  if (isFlushing || logQueue.length === 0) return;

  isFlushing = true;

  // Extract the queue and reset it immediately so new logs can accumulate
  const batch = [...logQueue];
  logQueue = [];

  try {
    const db = await connectToDatabase();
    await createLoggerTable(db);

    // SQLite requires JSON objects to be stringified
    const dbReadyBatch = batch.map(log => ({
      ...log,
      log_payload:
        typeof log.log_payload === 'object'
          ? JSON.stringify(log.log_payload)
          : log.log_payload,
    }));

    await insertLogsBatch(db, dbReadyBatch);
    await rotateLogs(db); // Clean up old logs
  } catch (err) {
    console.error('[Logger] DB Flush Error:', err);
    // CRITICAL FIX: Put the failed batch BACK into the front of the queue
    logQueue = [...batch, ...logQueue];
  } finally {
    isFlushing = false;
  }
};

/* ======================================================
   SERVER SYNC
====================================================== */

/**
 * Pulls unsynced logs from SQLite and pushes them to the backend API.
 * @param {string} userToken - The authorization token
 */
const syncLogsToServer = async userToken => {
  if (isSyncing || !userToken) return;

  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  isSyncing = true;

  try {
    const db = await connectToDatabase();
    await createLoggerTable(db);

    const unsyncedLogs = await getUnsyncedLogs(db, 200);

    if (!unsyncedLogs || unsyncedLogs.length === 0) {
      isSyncing = false;
      return;
    }

    // Safely parse the SQLite strings back into JSON objects for the server
    const payload = unsyncedLogs.map(log => {
      let parsedPayload = {};
      try {
        parsedPayload =
          typeof log.log_payload === 'string'
            ? JSON.parse(log.log_payload)
            : log.log_payload;
      } catch (e) {
        parsedPayload = { error: 'Failed to parse stored payload' };
      }

      return {
        session_id: log.session_id,
        action_type: log.action_type,
        event_time: log.event_time,
        log_payload: parsedPayload,
      };
    });

    const response = await fetch(`${config.Base_URL}/api/sync_face_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ logs: payload }),
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    // If successful, mark them synced so they aren't sent again
    const ids = unsyncedLogs.map(l => l.id);
    await markLogsSynced(db, ids);
  } catch (err) {
    console.warn('[Logger] Server Sync Error:', err.message);
  } finally {
    isSyncing = false;
  }
};

/* ======================================================
   ENGINE INITIALIZATION
====================================================== */

/**
 * Starts the automated flushing and syncing intervals.
 * Safe to call multiple times (e.g., on AppState changes) without creating memory leaks.
 * @param {string} userToken - The authorization token
 */
export const startLoggerEngine = userToken => {
  if (!flushInterval) {
    flushInterval = setInterval(flushLogsToDB, 15000);
  }

  if (!syncInterval) {
    syncInterval = setInterval(() => {
      syncLogsToServer(userToken);
    }, 30 * 60 * 1000);
  }

  // Prevent attaching duplicate event listeners
  if (!netInfoUnsubscribe) {
    netInfoUnsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncLogsToServer(userToken);
      }
    });
  }
};

/* ======================================================
   ATTACHMENT HELPERS
====================================================== */

/**
 * Appends the current API route being called to the active session.
 */
export const attachApiInfo = (session, apiUrl) => {
  if (!session?.log_payload?.device) return;
  if (!session.log_payload.device.runtime) {
    session.log_payload.device.runtime = {};
  }
  session.log_payload.device.runtime.current_api = apiUrl;
};

/**
 * Appends a truncated GraphQL/SQL query string to the active session.
 */
export const attachQueryInfo = (session, queryString) => {
  if (!session?.log_payload?.device) return;
  if (!session.log_payload.device.runtime) {
    session.log_payload.device.runtime = {};
  }

  const cleanQuery =
    queryString?.length > 300
      ? queryString.substring(0, 300) + '...'
      : queryString;

  session.log_payload.device.runtime.current_query = cleanQuery;
};

/**
 * Appends arbitrary key-value pairs to the root of the session payload.
 */
export const attachAdditionalData = (session, key, value) => {
  if (!session?.log_payload) return;
  session.log_payload[key] = value;
};
