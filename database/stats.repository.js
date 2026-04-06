// database/stats.repository.js

import { fetchAll } from './helpers';

export const getPunchStatistics = async (db, uuid, startDate, endDate) => {
  return fetchAll(
    db,
    `SELECT projectid,
       COUNT(CASE WHEN punchtype='in' THEN 1 END) as punch_ins,
       COUNT(CASE WHEN punchtype='out' THEN 1 END) as punch_outs
     FROM punchrecord
     WHERE uuid = ?
       AND date(punchdate) BETWEEN date(?) AND date(?)
     GROUP BY projectid`,
    [uuid, startDate, endDate],
  );
};
