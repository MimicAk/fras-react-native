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
import { loadVectorsService } from './face.service';

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
      throw new Error('Vector fetch failed');
    }

    const json = await response.json();
    const data = json?.data?.data || [];
    totalCount = json?.data?.total_count || 0;

    if (data.length === 0) break;

    // 🔥 Insert inside transaction
    await db.transaction(async tx => {
      for (const item of data) {
        await addStaff(db, {
          uuid: item?.empguid,
          staffid: item?.user?.emp_id,
          name: item?.user?.name,

          // 🔥 avg embedding
          vector: item?.vector,

          // 🔥 multi embeddings (fallback if backend not ready)
          vectors: item?.vectors || JSON.stringify([JSON.parse(item?.vector)]),

          img: item?.image,
          syncdate: new Date().toISOString(),
          enrollmode: 'online',
          createdby: item?.created_by,
        });

        processedCount++;
      }
    });

    if (onProgress) {
      onProgress(processedCount, totalCount);
    }

    page++;
  }

  await AsyncStorage.setItem(
    'lastsyncdate',
    new Date().toISOString().split('T')[0],
  );

  // 🔥 rebuild vector cache after pull
  await loadVectorsService(db);

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
    throw new Error('Push failed');
  }

  // 🔥 mark only pushed records
  const uuids = unSynced.map(item => item.empguid);
  await markStaffSynced(db, uuids);

  // 🔥 refresh in-memory vectors
  await loadVectorsService(db);

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

    // ✅ Get last sync
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
        console.log(response.blob)
        throw new Error('Vector fetch failed');
      }

      const json = await response.json();
      const data = json?.data?.data || [];
      totalCount = json?.data?.total_count || 0;

      console.log(json)

      // 🔴 Stop if no data
      if (!data.length) break;

      // 🔥 UPSERT TRANSACTION
      await db.transaction(async tx => {
        for (const item of data) {
          let vectors = item?.vectors;

          // ✅ Safe fallback for old data
          if (!vectors) {
            try {
              const parsed = JSON.parse(item?.vector || '[]');
              vectors = JSON.stringify([parsed]);
            } catch {
              vectors = JSON.stringify([]);
            }
          }

          await addStaff(db, {
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
        }
      });

      // ✅ Update progress
      if (onProgress) {
        onProgress(processedCount, totalCount);
      }

      // 🔥 CRITICAL: update last sync AFTER EACH PAGE
      const lastItem = data[data.length - 1];

      let latestSyncValue;

      if (lastItem?.updated_at) {
        latestSyncValue = lastItem.updated_at; // BEST (timestamp)
      } else {
        latestSyncValue = new Date().toISOString().split('T')[0]; // fallback
      }

      await AsyncStorage.setItem(syncKey, latestSyncValue);

      // 🔁 Move next page
      page++;
    }

    // ✅ Reload in-memory vectors after full sync
    await loadVectorsService(db);

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
