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

export const pullVectorsService = async ({ token, userGuid, onProgress }) => {
  const db = await connectToDatabase();
  await createTables(db);

  let page = 1;
  const length = 25;
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

    // Insert inside transaction
    await db.transaction(async tx => {
      for (const item of data) {
        await addStaff(db, {
          uuid: item?.empguid,
          staffid: item?.user?.emp_id,
          name: item?.user?.name,
          vector: item?.vector,
          img: item?.image,
          syncdate: new Date().toISOString(),
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

  return { totalCount, processedCount };
};

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

  await markStaffSynced(db);

  return { pushed: unSynced.length };
};
