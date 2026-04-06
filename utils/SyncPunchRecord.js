import { connectToDatabase, createTables, deleteSyncedApplogRecord, getAsyncPunchRecords, updatePunchRecord, getApplogRecord } from '../db';
import { config } from '../config/config';
import { logPayload } from './APIException';

// Track last sync time to prevent multiple syncs
let lastSyncTime = 0;
const SYNC_COOLDOWN = 60000; // 1 minute cooldown between syncs

export const punchRecord = async (user, force = false) => {
  const now = Date.now();
  
  // Check if we should sync (cooldown period)
  if (!force && now - lastSyncTime < SYNC_COOLDOWN) {
    console.log("Sync skipped - too soon since last sync");
    return { skipped: true, reason: "cooldown" };
  }

  console.log("punchRecord sync started", new Date().toISOString());
  
  try {
    const database = await connectToDatabase();
    await createTables(database);
    
    // Get unsynced records (only today's records)
    let checkIn = await getAsyncPunchRecords(database, "offline", "in");
    let checkOut = await getAsyncPunchRecords(database, "offline", "out");
    
    console.log("Unsynced records:", { 
      checkIn: checkIn?.length || 0, 
      checkOut: checkOut?.length || 0 
    });

    // Only sync if there are records to sync
    let syncedCount = 0;

    // Sync Check-ins
    if (checkIn?.length > 0) {
      const result = await syncCheckIns(database, user, checkIn);
      if (result.success) {
        syncedCount += result.syncedCount;
        console.log(`Synced ${result.syncedCount} check-ins`);
      }
    }

    // Sync Check-outs
    if (checkOut?.length > 0) {
      const result = await syncCheckOuts(database, user, checkOut);
      if (result.success) {
        syncedCount += result.syncedCount;
        console.log(`Synced ${result.syncedCount} check-outs`);
      }
    }

    // Update last sync time only if we actually synced something
    if (syncedCount > 0) {
      lastSyncTime = now;
    }

    console.log("Punch records sync completed");
    return { success: true, syncedCount };
    
  } catch (error) {
    console.error("punchRecord sync error:", error);
    logPayload({ 
      type: "punchRecord_error",
      error: error.message,
      stack: error.stack 
    });
    return { success: false, error: error.message };
  }
};

// Sync check-ins with API response handling - MODIFIED to return counts
const syncCheckIns = async (database, user, checkInRecords) => {
  try {
    console.log("Syncing check-ins:", checkInRecords.length);
    
    const checkInResponse = await fetch(`${config.Base_URL}/api/bulk_checkin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user?.token}`,
      },
      body: JSON.stringify({
        employees: checkInRecords
      }),
    });

    const responseData = await checkInResponse.json();
    console.log("Check-in API Response:", responseData);

    // Handle synced and failed IDs from response
    const syncedIds = responseData.synced_ids || [];
    const failedIds = responseData.failed_ids || [];

    console.log(`Check-in - Synced: ${syncedIds.length}, Failed: ${failedIds.length}`);

    // Update database based on response
    if (syncedIds.length > 0) {
      await updatePunchRecord(database, "in", "offline", syncedIds, []);
      console.log(`Updated ${syncedIds.length} check-ins as synced`);
    }

    if (failedIds.length > 0) {
      await updatePunchRecord(database, "in", "offline", [], failedIds);
      console.log(`Marked ${failedIds.length} check-ins for retry`);
      
      const failedRecords = checkInRecords.filter(record => 
        failedIds.includes(record.id)
      );
      logPayload({
        type: "checkin_failed",
        employees: failedRecords,
        errors: responseData.errors
      });
    }

    return { 
      success: true, 
      syncedCount: syncedIds.length,
      failedCount: failedIds.length 
    };

  } catch (error) {
    console.error("Error syncing check-ins:", error);
    logPayload({
      type: "checkin_error",
      employees: checkInRecords,
      error: error.message
    });
    return { success: false, error: error.message };
  }
};

// Sync check-outs with API response handling - MODIFIED to return counts
const syncCheckOuts = async (database, user, checkOutRecords) => {
  try {
    console.log("Syncing check-outs:", checkOutRecords.length);
    
    const checkOutResponse = await fetch(`${config.Base_URL}/api/bulk_checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user?.token}`,
      },
      body: JSON.stringify({
        employees: checkOutRecords
      }),
    });

    const responseData = await checkOutResponse.json();
    console.log("Check-out API Response:", responseData);

    // Handle synced and failed IDs from response
    const syncedIds = responseData.synced_ids || [];
    const failedIds = responseData.failed_ids || [];

    console.log(`Check-out - Synced: ${syncedIds.length}, Failed: ${failedIds.length}`);

    // Update database based on response
    if (syncedIds.length > 0) {
      await updatePunchRecord(database, "out", "offline", syncedIds, []);
      console.log(`Updated ${syncedIds.length} check-outs as synced`);
    }

    if (failedIds.length > 0) {
      await updatePunchRecord(database, "out", "offline", [], failedIds);
      console.log(`Marked ${failedIds.length} check-outs for retry`);
      
      const failedRecords = checkOutRecords.filter(record => 
        failedIds.includes(record.id)
      );
      logPayload({
        type: "checkout_failed",
        employees: failedRecords,
        errors: responseData.errors
      });
    }

    return { 
      success: true, 
      syncedCount: syncedIds.length,
      failedCount: failedIds.length 
    };

  } catch (error) {
    console.error("Error syncing check-outs:", error);
    logPayload({
      type: "checkout_error",
      employees: checkOutRecords,
      error: error.message
    });
    return { success: false, error: error.message };
  }
};

export const pushLogs = async () => {
  try {
    const database = await connectToDatabase();
    let { logs, dateTime } = await getApplogRecord(database);
    
    console.log("pushLogs - Records to sync:", logs?.length || 0);
    
    if (!logs || logs.length === 0) {
      console.log("No logs to sync");
      return;
    }

    let response = await fetch(`${config.Base_URL}/api/add_enrolled_payload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        add_payload: logs
      }),
    });

    const responseData = await response.json();
    console.log("pushLogs Response:", responseData);

    if (response.ok && responseData.status === 200) {
      await deleteSyncedApplogRecord(database, dateTime);
      console.log("Logs synced and deleted successfully");
    }

  } catch (error) {
    console.error("pushLogs error:", error);
    logPayload({
      type: "logs_sync_error",
      error: error.message
    });
  }
};