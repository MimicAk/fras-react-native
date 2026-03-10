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

/* ======================================================
   INTERNAL STATE
====================================================== */

let syncInterval = null;
let isSyncRunning = false;

/* ======================================================
   SEQUENTIAL PAIRING LOGIC
====================================================== */

const pairPunchesSequentially = (rows = []) => {
  if (!rows.length) return [];

  const grouped = new Map();

  // ✅ Group by employee + attendance type
  for (const row of rows) {
    const key = `${row.uuid}_${row.attendancetype}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(row);
  }

  const pairedResults = [];

  for (const [, punches] of grouped.entries()) {
    // ✅ Sort by punchdate ASC
    punches.sort((a, b) => new Date(a.punchdate) - new Date(b.punchdate));

    let currentCheckIn = null;

    for (const punch of punches) {
      // 🔹 If IN
      if (punch.punchtype === 'in') {
        // If somehow previous IN was not paired (defensive safety)
        if (currentCheckIn) {
          pairedResults.push({
            guid: currentCheckIn.id,
            emp_id: currentCheckIn.uuid,
            project_id: currentCheckIn.projectid,
            attendance_type: currentCheckIn.attendancetype,
            date: currentCheckIn.punchdate.split('T')[0],

            checkin_time: currentCheckIn.punchdate,
            checkout_time: null,

            checkin_lat: currentCheckIn.lat,
            checkin_lang: currentCheckIn.lan,

            checkout_lat: null,
            checkout_lang: null,

            // <-- ADDED MANUAL & IMAGE FIELDS -->
            checkin_is_manual: currentCheckIn.ismanual,
            checkout_is_manual: 0,
            checkin_image: currentCheckIn.userimage,
            checkout_image: null,

            local_ids: [currentCheckIn.id],
          });
        }

        currentCheckIn = punch;
      }

      // 🔹 If OUT
      else if (punch.punchtype === 'out') {
        if (currentCheckIn) {
          pairedResults.push({
            guid: currentCheckIn.id, // ✅ Always checkin ID

            emp_id: currentCheckIn.uuid,
            project_id: currentCheckIn.projectid,
            attendance_type: currentCheckIn.attendancetype,
            date: currentCheckIn.punchdate.split('T')[0],

            checkin_time: currentCheckIn.punchdate,
            checkout_time: punch.punchdate,

            checkin_lat: currentCheckIn.lat,
            checkin_lang: currentCheckIn.lan,

            checkout_lat: punch.lat,
            checkout_lang: punch.lan,

            // <-- ADDED MANUAL & IMAGE FIELDS -->
            checkin_is_manual: currentCheckIn.ismanual,
            checkout_is_manual: punch.ismanual,
            checkin_image: currentCheckIn.userimage,
            checkout_image: punch.userimage,

            local_ids: [currentCheckIn.id, punch.id],
          });

          currentCheckIn = null;
        } else {
          // Defensive safety (should not happen as per your business rule)
          console.warn('Checkout without checkin detected:', punch);
        }
      }
    }

    // ✅ If IN exists without OUT → push checkin only
    if (currentCheckIn) {
      pairedResults.push({
        guid: currentCheckIn.id,

        emp_id: currentCheckIn.uuid,
        project_id: currentCheckIn.projectid,
        attendance_type: currentCheckIn.attendancetype,
        date: currentCheckIn.punchdate.split('T')[0],

        checkin_time: currentCheckIn.punchdate,
        checkout_time: null,

        checkin_lat: currentCheckIn.lat,
        checkin_lang: currentCheckIn.lan,

        checkout_lat: null,
        checkout_lang: null,

        checkin_is_manual: currentCheckIn.ismanual,
        checkout_is_manual: 0,
        checkin_image: currentCheckIn.userimage,
        checkout_image: null,

        local_ids: [currentCheckIn.id],
      });
    }
  }

  return pairedResults;
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

    // console.log(unsynced);

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

        formData.append('guid', record.guid);
        formData.append('emp_id', record.emp_id);
        formData.append('project_id', record.project_id);
        formData.append('date', record.date);
        formData.append('checkin_time', record.checkin_time);
        formData.append('checkout_time', record.checkout_time);

        formData.append('checkin_lat', record.checkin_lat);
        formData.append('checkin_lang', record.checkin_lang);
        formData.append('checkout_lat', record.checkout_lat);
        formData.append('checkout_lang', record.checkout_lang);

        formData.append('checkin_is_manual', record.checkin_is_manual);
        formData.append('checkout_is_manual', record.checkout_is_manual);

        const checkinPath = await base64ToFile(
          record.checkin_image,
          'checkin.jpg',
        );
        const checkoutPath = await base64ToFile(
          record.checkout_image,
          'checkout.jpg',
        );

        // Convert base64 → file
        if (record.checkin_image) {
          formData.append('checkin_image', {
            uri: `file://${checkinPath}`,
            type: 'image/jpeg',
            name: 'checkin.jpg',
          });
        }

        if (record.checkout_image) {
          formData.append('checkout_image', {
            uri: `file://${checkoutPath}`,
            type: 'image/jpeg',
            name: 'checkout.jpg',
          });
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

// UTIL FUNCTION

async function base64ToFile(base64, filename) {
  const path = `${RNFS.CachesDirectoryPath}/${filename}`;

  await RNFS.writeFile(path, base64, 'base64');

  return path;
}
