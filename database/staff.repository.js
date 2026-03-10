// database/staff.repository.js

import { execute, fetchAll, fetchOne, now, today } from './helpers';

/* =========================================================
   ADD OR REPLACE STAFF
========================================================= */
export const addStaff = async (db, staffData) => {
  if (!staffData?.uuid) {
    throw new Error('Staff UUID is required');
  }

  return execute(
    db,
    `
    INSERT OR REPLACE INTO facevector
    (uuid, staffid, name, vector, img, syncdate, enrollmode, createdby)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      staffData.uuid,
      staffData.staffid || '',
      staffData.name || '',
      staffData.vector || 'null',
      staffData.img || '',
      now(),
      staffData.enrollmode || 'online',
      staffData.createdby || '',
    ],
  );
};

/* =========================================================
   UPDATE STAFF META (enrollmode / createdby)
========================================================= */
export const updateStaff = async (db, staffData) => {
  if (!staffData?.uuid) {
    throw new Error('Staff UUID required');
  }

  return execute(
    db,
    `
    UPDATE facevector
    SET enrollmode = ?, createdby = ?
    WHERE uuid = ?
    `,
    [
      staffData.enrollmode || 'online',
      staffData.createdby || '',
      staffData.uuid,
    ],
  );
};

/* =========================================================
   GET ALL STAFF WITH FACE VECTOR
========================================================= */
export const getAllStaff = async db => {
  return fetchAll(
    db,
    `
    SELECT uuid, staffid, name, vector
    FROM facevector
    WHERE vector IS NOT NULL
      AND vector != 'null'
    `,
  );
};

/* =========================================================
   SEARCH STAFF
========================================================= */
export const searchStaff = async (db, searchTerm) => {
  return fetchAll(
    db,
    `
    SELECT uuid, staffid, name, vector
    FROM facevector
    WHERE staffid LIKE ?
       OR name LIKE ?
    LIMIT 20
    `,
    [`%${searchTerm}%`, `%${searchTerm}%`],
  );
};

/* =========================================================
   GET STAFF IMAGE
========================================================= */
export const getStaffImage = async (db, uuid) => {
  const result = await fetchOne(
    db,
    `SELECT img FROM facevector WHERE uuid = ?`,
    [uuid],
  );

  return result?.img || null;
};

/* =========================================================
   GET STAFF ENROLLED OFFLINE (NOT SYNCED)
========================================================= */
export const getOfflineStaff = async db => {
  return fetchAll(
    db,
    `
    SELECT uuid, staffid, name, vector, img, syncdate, createdby
    FROM facevector
    WHERE enrollmode = 'offline'
    `,
  );
};

/* =========================================================
   MARK STAFF AS SYNCED (AFTER API SUCCESS)
========================================================= */
export const markStaffSynced = async (db, uuids = []) => {
  if (!uuids.length) return;

  const placeholders = uuids.map(() => '?').join(',');

  return execute(
    db,
    `
    UPDATE facevector
    SET enrollmode = 'online',
        syncdate = ?
    WHERE uuid IN (${placeholders})
    `,
    [now(), ...uuids],
  );
};

/* =========================================================
   GET TODAY SYNCED STAFF UUIDs
========================================================= */
export const getTodaySyncedStaff = async db => {
  const rows = await fetchAll(
    db,
    `
    SELECT uuid
    FROM facevector
    WHERE date(syncdate) = date(?)
    `,
    [today()],
  );

  return rows.map(r => r.uuid);
};

/* =========================================================
   DELETE STAFF (OPTIONAL)
   ⚠️ Only use if really needed
========================================================= */
export const deleteStaff = async (db, uuid) => {
  return execute(db, `DELETE FROM facevector WHERE uuid = ?`, [uuid]);
};


/**
 * Get all locally enrolled staff that are NOT synced to server
 * Criteria:
 *  - enrollmode = 'offline'
 *  - syncdate IS NULL
 */
export const getAllStaffNotSync = async db => {
  try {
    const rows = await fetchAll(
      db,
      `
      SELECT 
        uuid,
        staffid,
        name,
        vector,
        img,
        createdby
      FROM facevector
      WHERE enrollmode = 'offline'
        AND (syncdate IS NULL OR syncdate = '')
      `,
    );

    // Format payload to match backend API
    const formatted = rows.map(item => ({
      empguid: item.uuid,
      emp_id: item.staffid,
      name: item.name,
      vector: item.vector,
      image: item.img,
      createdby: item.createdby,
    }));

    return formatted;
  } catch (error) {
    console.error('[StaffRepo] getAllStaffNotSync error:', error);
    return [];
  }
};
