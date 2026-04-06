import { execute, fetchAll, now } from './helpers';

/* ==========================================
   BULK INSERT LOGS (OPTIMIZED)
========================================== */
export const insertLogsBatch = async (db, logs = []) => {
  if (!logs.length) return;

  // 1. Create a single array of values for all rows
  const values = [];
  
  // 2. Create the placeholder string: "(?, ?, ?, ?, 0, ?), (?, ?, ?, ?, 0, ?)..."
  const placeholders = logs.map(log => {
    values.push(
      log.session_id,
      log.action_type,
      log.event_time,
      // Pass the payload directly since it's already stringified in the service layer
      log.log_payload, 
      now()
    );
    return '(?, ?, ?, ?, 0, ?)';
  }).join(', ');

  // 3. Execute exactly ONE query for the entire batch
  await execute(
    db,
    `
    INSERT OR IGNORE INTO face_operation_logs 
    (session_id, action_type, event_time, log_payload, sync_status, created_at)
    VALUES ${placeholders}
    `,
    values
  );
};

/* ==========================================
   GET UNSYNCED LOGS
========================================== */
export const getUnsyncedLogs = async (db, limit = 100) => {
  return fetchAll(
    db,
    `
    SELECT * FROM face_operation_logs
    WHERE sync_status = 0
    ORDER BY created_at ASC
    LIMIT ?
    `,
    [limit]
  );
};

/* ==========================================
   MARK LOGS SYNCED
========================================== */
export const markLogsSynced = async (db, ids = []) => {
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');

  await execute(
    db,
    `
    UPDATE face_operation_logs
    SET sync_status = 1
    WHERE id IN (${placeholders})
    `,
    ids
  );
};

/* ==========================================
   LOG ROTATION (30 DAYS)
========================================== */
export const rotateLogs = async (db) => {
  await execute(
    db,
    `
    DELETE FROM face_operation_logs
    WHERE created_at < datetime('now','-30 days')
    `
  );
};