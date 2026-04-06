import { execute, fetchAll, fetchOne } from './helpers';

/* =========================================================
   ADD FACE UPDATE (AVG + MULTI VECTORS)
========================================================= */
export const addFaceUpdate = async (db, data) => {
  return execute(
    db,
    `
    INSERT INTO facevector_updates
    (uuid, staffid, vector, vectors, img, action)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      data.uuid,
      data.staffid,
      data.vector,    // avg embedding
      data.vectors,   // 🔥 multi embeddings
      data.img,
      data.action || 'update',
    ],
  );
};

/* =========================================================
   GET UNSYNCED FACE UPDATES
========================================================= */
export const getUnsyncedFaceUpdates = async db => {
  return fetchAll(
    db,
    `
    SELECT
      id,
      uuid,
      staffid,
      vector,
      vectors,
      img,
      action,
      retry_count
    FROM facevector_updates
    WHERE sync_status = 0
    ORDER BY created_at ASC
    `,
  );
};

/* =========================================================
   MARK FACE UPDATES AS SYNCED
========================================================= */
export const markFaceUpdatesSynced = async (db, ids = []) => {
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');

  await execute(
    db,
    `
    UPDATE facevector_updates
    SET sync_status = 1,
        last_attempt = ?
    WHERE id IN (${placeholders})
    `,
    [Date.now(), ...ids],
  );
};

/* =========================================================
   MARK FACE UPDATE RETRY (ON FAILURE)
========================================================= */
export const markFaceUpdateRetry = async (
  db,
  ids = [],
  errorMsg = 'Sync failed',
) => {
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');

  await execute(
    db,
    `
    UPDATE facevector_updates
    SET retry_count = IFNULL(retry_count,0) + 1,
        last_error = ?,
        last_attempt = ?
    WHERE id IN (${placeholders})
    `,
    [errorMsg, Date.now(), ...ids],
  );
};

/* =========================================================
   CLEANUP SYNCED RECORDS
========================================================= */
export const cleanupSyncedFaceUpdates = async db => {
  await execute(
    db,
    `
    DELETE FROM facevector_updates
    WHERE sync_status = 1
    `,
  );
};