import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { config } from '../config/config';

import {
  getUnsyncedPunches,
  markPunchSynced,
  markPunchRetry,
  getPunchesByGroups,
} from '../database/punch.repository';

import {
  getUnsyncedFaceUpdates,
  markFaceUpdatesSynced,
  markFaceUpdateRetry,
} from '../database/facevector_updates.repository';

import { connectToDatabase } from '../database/connection';
import { createTables } from '../database/schema';

import RNFS from 'react-native-fs';
import { syncVectorsPullOnly } from './sync.service';
import {
  formatCheckIn,
  formatCheckOut,
  formatPair,
} from './attendance.service';

/* ======================================================
   INTERNAL STATE
====================================================== */

let syncInterval = null;
let isSyncRunning = false;

/* ======================================================
   SEQUENTIAL PAIRING LOGIC
====================================================== */

/* ======================================================
   SEQUENTIAL PAIRING LOGIC (Daily Boundary Fixed)
====================================================== */

const pairPunchesSequentially = (rows = []) => {
  if (!rows.length) return [];

  const grouped = new Map();

  // ✅ Group by employee + attendance type + DATE
  for (const row of rows) {
    // Extract just the YYYY-MM-DD from the punchdate
    const dateObj = new Date(row.punchdate);
    const dateKey = `${dateObj.getFullYear()}-${String(
      dateObj.getMonth() + 1,
    ).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

    const key = `${row.uuid}_${row.attendancetype}_${dateKey}`;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const pairedResults = [];

  for (const [, punches] of grouped.entries()) {
    // ✅ Sort chronologically
    punches.sort((a, b) => new Date(a.punchdate) - new Date(b.punchdate));

    let currentCheckIn = null;

    for (const punch of punches) {
      // 🔹 IN Punch
      if (punch.punchtype === 'in') {
        // If an IN is already open, push it as a Standalone IN
        if (currentCheckIn) {
          pairedResults.push(formatCheckIn(currentCheckIn));
        }
        currentCheckIn = punch;
      }

      // 🔹 OUT Punch
      else if (punch.punchtype === 'out') {
        if (currentCheckIn) {
          // ✅ VALID PAIR (IN → OUT on the same day)
          pairedResults.push(formatPair(currentCheckIn, punch));
          currentCheckIn = null;
        } else {
          // ✅ Standalone OUT (No preceding IN found for this day)
          pairedResults.push(formatCheckOut(punch));
        }
      }
    }

    // 🔹 Remaining IN (No OUT found before the day ended)
    if (currentCheckIn) {
      pairedResults.push(formatCheckIn(currentCheckIn));
    }
  }

  return pairedResults;
};

const buildSyncKey = record => {
  return [
    record.emp_id,
    record.attendance_type,
    record.checkin_time || '',
    record.checkout_time || '',
  ].join('_');
};

/* ======================================================
   MAIN SYNC FUNCTION
====================================================== */

export const runBackgroundSync = async userToken => {
  if (isSyncRunning) return;
  isSyncRunning = true;

  try {
    const db = await connectToDatabase();
    await createTables(db);

    const unsynced = await getUnsyncedPunches(db);

    if (!unsynced?.length) {
      isSyncRunning = false;
      return;
    }

    console.log(unsynced);

    const groupKeys = [
      ...new Set(unsynced.map(r => `${r.uuid}_${r.attendancetype}`)),
    ];

    const fullPunches = await getPunchesByGroups(db, groupKeys);

    const pairedRecords = pairPunchesSequentially(fullPunches);

    if (!pairedRecords.length) {
      isSyncRunning = false;
      return;
    }

    for (const record of pairedRecords) {
      try {
        

        const formData = new FormData();

        formData.append('sync_key', buildSyncKey(record));
        formData.append('guid', record.guid || '');
        formData.append('emp_id', record.emp_id || '');
        formData.append('project_id', record.project_id || '');
        formData.append('date', record.date || '');

        // Ensure missing times are sent as empty strings, not "undefined"
        formData.append('checkin_time', record.checkin_time || '');
        formData.append('checkout_time', record.checkout_time || '');

        formData.append('checkin_lat', record.checkin_lat || '');
        formData.append('checkin_lang', record.checkin_lang || '');
        formData.append('checkout_lat', record.checkout_lat || '');
        formData.append('checkout_lang', record.checkout_lang || '');

        formData.append('checkin_is_manual', record.checkin_is_manual || 0);
        formData.append('checkout_is_manual', record.checkout_is_manual || 0);

        if (record.checkin_image) {
          let img = record.checkin_image;
          if (!img.startsWith('data:image')) {
            img = `data:image/jpeg;base64,${img}`;
          }
          formData.append('checkin_image', img);
        }

        if (record.checkout_image) {
          let img = record.checkout_image;
          if (!img.startsWith('data:image')) {
            img = `data:image/jpeg;base64,${img}`;
          }
          formData.append('checkout_image', img);
        }

        const response = await fetch(
          `${config.Base_URL}/api/user-checkin-checkout`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
            body: formData,
          },
        );

        const responseText = await response.text();
        console.log(response);
        console.log('response:', responseText);
        console.log(formData);
        console.log(pairedRecords);

        if (!response.ok) {
          throw new Error('Server rejected record');
        }

        await markPunchSynced(db, record.local_ids);
      } catch (error) {
        // console.log(error);
        await markPunchRetry(db, record.local_ids, error.message);
      }
    }
  } catch (err) {
    console.log('Background Sync Error:', err.message);
  }

  isSyncRunning = false;
};

export const syncVectorBackground = async (userToken, userGuid) => {
  try {
    const db = await connectToDatabase();
    await createTables(db);

    const unsyncedFaces = await getUnsyncedFaceUpdates(db);

    if (!unsyncedFaces?.length) {
      return;
    }

    for (const face of unsyncedFaces) {
      try {
        let base64Image = face.img;

        // Ensure proper base64 format
        if (!base64Image.startsWith('data:image')) {
          base64Image = `data:image/jpeg;base64,${base64Image}`;
        }

        // console.log(userGuid);

        const response = await fetch(
          `${config.Base_URL}/api/saveentrolledimage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${userToken}`,
            },
            body: JSON.stringify({
              empguid: face.uuid,
              vector: JSON.stringify(face.vector),
              vectors: JSON.stringify(face.vectors),
              blob: base64Image,
              createdby: userGuid,
            }),
          },
        );

        console.log(response);
        // console.log(response.blob);
        // console.log(response.body);

        if (!response.ok) {
          throw new Error('Server rejected face update');
        }

        await markFaceUpdatesSynced(db, [face.id]);
      } catch (error) {
        await markFaceUpdateRetry(db, [face.id], error.message);
      }
    }
  } catch (error) {
    console.log('Vector Background Sync Error:', error.message);
  }
};

/* ======================================================
   AUTO START SERVICE
====================================================== */

export const startBackgroundSyncService = userToken => {
  NetInfo.addEventListener(state => {
    if (state.isConnected) {
      runBackgroundSync(userToken);
    }
  });

  console.log('started bg service');

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      runBackgroundSync(userToken);
    }
  });

  if (!syncInterval) {
    syncInterval = setInterval(() => {
      runBackgroundSync(userToken);
    }, 15 * 60 * 1000);
  }
};

let isVectorPullRunning = false;

export const runVectorPullSync = async (userToken, userGuid) => {
  if (isVectorPullRunning) return;
  isVectorPullRunning = true;

  try {
    console.log('⬇️ Vector Pull Sync Started');

    await syncVectorsPullOnly({
      token: userToken,
      userGuid,
    });

    console.log('✅ Vector Pull Sync Completed');
  } catch (err) {
    console.log('❌ Vector Pull Sync Error:', err.message);
  } finally {
    isVectorPullRunning = false;
  }
};

// UTIL FUNCTION

async function base64ToFile(base64, filename) {
  const path = `${RNFS.CachesDirectoryPath}/${filename}`;

  await RNFS.writeFile(path, base64, 'base64');

  return path;
}
