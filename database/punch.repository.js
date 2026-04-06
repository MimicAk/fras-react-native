import {
  execute,
  fetchOne,
  fetchAll,
  today,
  now,
  transaction,
} from './helpers';

import { v4 as uuidv4 } from 'uuid';

/* -------------------------------------------------------
   RECORD PUNCH (IN / OUT)
------------------------------------------------------- */
export const recordPunch = async (db, punchData) => {
  if (!punchData.uuid || !punchData.punchType) {
    throw new Error('uuid and punchType required');
  }

  const punchType = punchData.punchType.toLowerCase();
  const currentDate = today();

  /* ---------- CHECK IN VALIDATION ---------- */
  // if (punchType === 'in') {
  //   const activeCheckIn = await fetchOne(
  //     db,
  //     `
  //     SELECT id FROM punchrecord
  //     WHERE uuid = ?
  //       AND attendancetype = ?
  //       AND punchtype = 'in'
  //       AND date(punchdate) = date(?)
  //       AND NOT EXISTS (
  //         SELECT 1 FROM punchrecord p2
  //         WHERE p2.uuid = punchrecord.uuid
  //           AND p2.attendancetype = punchrecord.attendancetype
  //           AND p2.punchtype = 'out'
  //           AND date(p2.punchdate) = date(punchrecord.punchdate)
  //       )
  //     `,
  //     [punchData.uuid, punchData.attendanceType || '', currentDate],
  //   );

  //   if (activeCheckIn) {
  //     throw new Error('Please checkout first');
  //   }
  // }

  /* ---------- CHECK OUT VALIDATION ---------- */
  // if (punchType === 'out') {
  //   const activeCheckIn = await fetchOne(
  //     db,
  //     `
  //     SELECT id FROM punchrecord
  //     WHERE uuid = ?
  //       AND attendancetype = ?
  //       AND projectid = ?
  //       AND punchtype = 'in'
  //       AND date(punchdate) = date(?)
  //       AND NOT EXISTS (
  //         SELECT 1 FROM punchrecord p2
  //         WHERE p2.uuid = punchrecord.uuid
  //           AND p2.projectid = punchrecord.projectid
  //           AND p2.punchtype = 'out'
  //           AND date(p2.punchdate) = date(punchrecord.punchdate)
  //       )
  //     `,
  //     [
  //       punchData.uuid,
  //       punchData.attendanceType || '',
  //       punchData.projectID || '',
  //       currentDate,
  //     ],
  //   );

  //   if (!activeCheckIn) {
  //     throw new Error('No active check-in found');
  //   }
  // }

  const recordId = uuidv4();

  // Default ismanual to 0 if not provided
  const ismanual =
    punchData.isManual || punchData.is_manual || punchData.ismanual ? 1 : 0;

  /* ---------- INSERT ---------- */
  await execute(
    db,
    `
    INSERT INTO punchrecord
    (id, uuid, punchtype, punchdate, lat, lan, attendancetype, projectid, punchmode, ismanual, userimage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      recordId,
      punchData.uuid,
      punchType,
      now(),
      punchData.lat || '',
      punchData.lan || '',
      punchData.attendanceType || '',
      punchData.projectID || '',
      punchData.punchMode || 'offline',
      ismanual,
      punchData.userimage || null, 
    ],
  );

  return true;
};

/* -------------------------------------------------------
   GET ALL UNSYNCED PUNCHES (READY FOR SYNC)
------------------------------------------------------- */
export const getUnsyncedPunches = async db => {
  return fetchAll(
    db,
    `
    SELECT 
      id,
      uuid,
      punchtype,
      punchdate,
      lat,
      lan,
      attendancetype,
      projectid,
      punchmode,
      retry_count,
      ismanual,
      userimage
    FROM punchrecord
    WHERE syncdate IS NULL
      AND punchmode = 'offline'
    ORDER BY punchdate ASC
    `,
  );
};

/**
 * Retrieves punch records from the database for the specified groups.
 *
 * Each group is a string in the format "uuid_attendancetype". The function constructs
 * a SQL WHERE clause to fetch records matching any of the provided groups.
 *
 * @param {object} db - The database connection object.
 * @param {string[]} groups - An array of group keys, each formatted as "uuid_attendancetype".
 * @returns {Promise<object[]>} A promise that resolves to an array of punch records.
 */
export const getPunchesByGroups = async (db, groups) => {
  if (!groups.length) return [];

  const conditions = groups
    .map(key => {
      const [uuid, attendancetype] = key.split('_');
      return `(uuid = '${uuid}' AND attendancetype = '${attendancetype}')`;
    })
    .join(' OR ');

  return fetchAll(
    db,
    `
    SELECT 
      id,
      uuid,
      punchtype,
      punchdate,
      lat,
      lan,
      attendancetype,
      projectid,
      punchmode,
      retry_count,
      syncdate,
      ismanual,
      userimage
    FROM punchrecord
    WHERE ${conditions}
    ORDER BY punchdate ASC
    `,
  );
};

/* -------------------------------------------------------
   CHECK TODAY PUNCH
------------------------------------------------------- */
export const checkTodayPunch = async (
  db,
  uuid,
  punchType,
  projectId,
  attendanceType,
) => {
  const result = await fetchOne(
    db,
    `
    SELECT COUNT(*) as count FROM punchrecord
    WHERE uuid = ?
      AND punchtype = ?
      AND projectid = ?
      AND attendancetype = ?
      AND date(punchdate) = date(?)
    `,
    [uuid, punchType, projectId || '', attendanceType || '', today()],
  );

  return result?.count > 0;
};

/* -------------------------------------------------------
   GET TODAY PUNCH STATUS (BATCH)
------------------------------------------------------- */
export const getTodayPunchStatus = async (
  db,
  uuids,
  punchType,
  projectId,
  attendanceType,
) => {
  if (!uuids?.length) return new Map();

  const placeholders = uuids.map(() => '?').join(',');

  const rows = await fetchAll(
    db,
    `
    SELECT uuid, COUNT(*) as count
    FROM punchrecord
    WHERE uuid IN (${placeholders})
      AND punchtype = ?
      AND projectid = ?
      AND attendancetype = ?
      AND date(punchdate) = date(?)
    GROUP BY uuid
    `,
    [...uuids, punchType, projectId || '', attendanceType || '', today()],
  );

  const map = new Map();
  rows.forEach(r => map.set(r.uuid, r.count > 0));

  return map;
};

/* -------------------------------------------------------
   GET ACTIVE CHECKIN
------------------------------------------------------- */
export const getActiveCheckIn = async (db, uuid, attendanceType) => {
  return fetchOne(
    db,
    `
    SELECT * FROM punchrecord pr
    WHERE pr.uuid = ?
      AND pr.attendancetype = ?
      AND pr.punchtype = 'in'
      AND date(pr.punchdate) = date(?)
      AND NOT EXISTS (
        SELECT 1 FROM punchrecord p2
        WHERE p2.uuid = pr.uuid
          AND p2.projectid = pr.projectid
          AND p2.punchtype = 'out'
          AND date(p2.punchdate) = date(pr.punchdate)
      )
    ORDER BY pr.punchdate DESC
    LIMIT 1
    `,
    [uuid, attendanceType, today()],
  );
};

/* -------------------------------------------------------
   PROCESS CHECKOUT + CHECKIN (TRANSACTION SAFE)
------------------------------------------------------- */
export const processCheckoutAndCheckin = async (
  db,
  checkoutData,
  checkinData,
) => {
  return transaction(db, async () => {
    await recordPunch(db, { ...checkoutData, punchType: 'out' });
    await recordPunch(db, { ...checkinData, punchType: 'in' });
  });
};

/* -------------------------------------------------------
   MARK PUNCH AS SYNCED
------------------------------------------------------- */
export const markPunchSynced = async (db, ids = []) => {
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');

  await execute(
    db,
    `UPDATE punchrecord SET syncdate = ? WHERE id IN (${placeholders})`,
    [now(), ...ids],
  );
};

/* -------------------------------------------------------
   MARK PUNCH RETRY
------------------------------------------------------- */
export const markPunchRetry = async (
  db,
  ids = [],
  errorMsg = 'Sync failed',
) => {
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');

  await execute(
    db,
    `
    UPDATE punchrecord
    SET retry_count = IFNULL(retry_count,0) + 1,
        last_error = ?,
        last_attempt = ?
    WHERE id IN (${placeholders})
    `,
    [errorMsg, now(), ...ids],
  );
};

/* -------------------------------------------------------
   GET PUNCH STATISTICS
------------------------------------------------------- */
export const getPunchStatistics = async (db, uuid, startDate, endDate) => {
  return fetchAll(
    db,
    `
    SELECT projectid,
      COUNT(CASE WHEN punchtype='in' THEN 1 END) as punch_ins,
      COUNT(CASE WHEN punchtype='out' THEN 1 END) as punch_outs,
      MIN(CASE WHEN punchtype='in' THEN punchdate END) as first_punch,
      MAX(CASE WHEN punchtype='out' THEN punchdate END) as last_punch
    FROM punchrecord
    WHERE uuid = ?
      AND date(punchdate) BETWEEN date(?) AND date(?)
    GROUP BY projectid
    `,
    [uuid, startDate, endDate],
  );
};

/* -------------------------------------------------------
   DEBUG USER PUNCHES
------------------------------------------------------- */
export const debugUserPunches = async (db, uuid, attendanceType) => {
  return fetchAll(
    db,
    `
    SELECT id, punchtype, punchdate, projectid, ismanual, userimage, -- <-- ADDED
           date(punchdate) as punch_day
    FROM punchrecord
    WHERE uuid = ?
      AND attendancetype = ?
    ORDER BY punchdate DESC
    LIMIT 20
    `,
    [uuid, attendanceType],
  );
};
