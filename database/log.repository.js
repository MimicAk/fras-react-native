// database/log.repository.js

import { execute, fetchAll, now } from "./helpers";

export const addLog = async (db, logData) => {
  return execute(
    db,
    `INSERT INTO applogs (deviceid, userid, task, data, syncdate, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      logData.deviceid,
      logData.userid,
      logData.task,
      logData.data,
      now(),
      "offline",
    ]
  );
};

export const getUnsyncedLogs = async (db) => {
  return fetchAll(
    db,
    `SELECT * FROM applogs WHERE status = 'offline'`
  );
};