// services/sync.service.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config/config';
import { connectToDatabase } from '../database/connection';
import { createTables } from '../database/schema';
import { addStaff } from '../database/staff.repository';
import {
  getAllStaffNotSync,
  markStaffSynced,
} from '../database/staff.repository';

/* =========================================================
   PULL VECTORS FROM SERVER (DOWNLOAD)
========================================================= */
export const pullVectorsService = async ({ token, userGuid, onProgress }) => {
  const db = await connectToDatabase();
  await createTables(db);

  let page = 1;
  const length = 50;
  let totalCount = 0;
  let processedCount = 0;

  let lastSyncDate = await AsyncStorage.getItem('lastsyncdate');
  if (!lastSyncDate) lastSyncDate = '2025-06-01';

  while (true) {
    const response = await fetch(`${config.Base_URL}/api/getallvectors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        update_date: lastSyncDate,
        createdby: userGuid,
        length,
        page,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vector fetch failed: ${errorText}`);
    }

    const json = await response.json();
    const data = json?.data?.data || [];
    totalCount = json?.data?.total_count || 0;

    if (data.length === 0) break;

    // 🔥 FIX: Execute all inserts properly in a transaction
    // Note: Ensure `addStaff` is updated to take `tx` and executeSql synchronously
    await new Promise((resolve, reject) => {
      db.transaction(
        tx => {
          data.forEach(item => {
            // If addStaff still requires async/db, you must rewrite it to be synchronous here:
            // tx.executeSql('INSERT INTO staff ...', [...]);
            addStaff(tx, {
              uuid: item?.empguid,
              staffid: item?.user?.emp_id,
              name: item?.user?.name,
              vector: item?.vector,
              vectors:
                item?.vectors || JSON.stringify([JSON.parse(item?.vector)]),
              img: item?.image,
              syncdate: new Date().toISOString(),
              enrollmode: 'online',
              createdby: item?.created_by,
            });
            processedCount++;
          });
        },
        reject,
        resolve,
      );
    });

    if (onProgress) {
      onProgress(processedCount, totalCount);
    }

    page++;
  }

  // ✅ Only save date after full successful sync
  await AsyncStorage.setItem(
    'lastsyncdate',
    new Date().toISOString().split('T')[0],
  );

  return { totalCount, processedCount };
};

/* =========================================================
   PUSH VECTORS TO SERVER (UPLOAD)
========================================================= */
export const pushVectorsService = async ({ token }) => {
  const db = await connectToDatabase();
  await createTables(db);

  const unSynced = await getAllStaffNotSync(db);

  if (!unSynced.length) return { pushed: 0 };

  const response = await fetch(
    `${config.Base_URL}/api/multipleSaveentrolledimage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(unSynced),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Push failed: ${errorText}`);
  }

  const uuids = unSynced.map(item => item.empguid);

  // 🔥 Wrap markings in transaction if not already handled in repository
  await markStaffSynced(db, uuids);

  return { pushed: unSynced.length };
};

const getSyncKey = userGuid => `vector_last_sync_${userGuid}`;

export const syncVectorsPullOnly = async ({ token, userGuid, onProgress }) => {
  try {
    const db = await connectToDatabase();
    await createTables(db);

    let page = 1;
    const length = 100;
    let totalCount = 0;
    let processedCount = 0;
    let highestSyncDate = null;

    const syncKey = getSyncKey(userGuid);
    let lastSyncDate = await AsyncStorage.getItem(syncKey);

    if (!lastSyncDate) {
      lastSyncDate = '2025-06-01';
    }

    while (true) {
      const response = await fetch(`${config.Base_URL}/api/getallvectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          update_date: lastSyncDate,
          createdby: userGuid,
          length,
          page,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('Vector fetch failed:', errText);
        throw new Error('Vector fetch failed');
      }

      const json = await response.json();
      const data = json?.data?.data || [];
      totalCount = json?.data?.total_count || 0;

      if (!data.length) break;

      // 🔥 FIX: Standard SQLite Transaction
      await new Promise((resolve, reject) => {
        db.transaction(
          tx => {
            data.forEach(item => {
              let vectors = item?.vectors;

              if (!vectors) {
                try {
                  const parsed = JSON.parse(item?.vector || '[]');
                  vectors = JSON.stringify([parsed]);
                } catch {
                  vectors = JSON.stringify([]);
                }
              }

              // Ensure addStaff is using tx.executeSql directly without async/await
              addStaff(tx, {
                uuid: item?.empguid,
                staffid: item?.user?.emp_id,
                name: item?.user?.name,
                vector: item?.vector,
                vectors: vectors,
                img: item?.image,
                syncdate: new Date().toISOString(),
                enrollmode: 'online',
                createdby: item?.created_by,
              });

              processedCount++;
            });
          },
          reject,
          resolve,
        );
      });

      if (onProgress) {
        onProgress(processedCount, totalCount);
      }

      // Track the latest date, but do NOT save to AsyncStorage yet
      const lastItem = data[data.length - 1];
      if (lastItem?.updated_at) {
        highestSyncDate = lastItem.updated_at;
      } else if (!highestSyncDate) {
        highestSyncDate = new Date().toISOString().split('T')[0];
      }

      page++;
    }

    // ✅ CRITICAL FIX: Update last sync ONLY after all pages finished successfully
    if (highestSyncDate) {
      await AsyncStorage.setItem(syncKey, highestSyncDate);
    }

    return {
      status: 'success',
      total: totalCount,
      processed: processedCount,
      lastSync: await AsyncStorage.getItem(syncKey),
    };
  } catch (error) {
    console.error('❌ Vector Pull Sync Error:', error);

    return {
      status: 'error',
      message: error.message,
    };
  }
};
