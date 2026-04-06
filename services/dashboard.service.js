// services/dashboard.service.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectToDatabase } from '../database/connection';
import { createTables } from '../database/schema';
import { getAllStaff } from '../database/staff.repository';

export const getTodayStatsService = async () => {
  try {
    const db = await connectToDatabase();
    await createTables(db);

    const today = new Date().toISOString().split('T')[0];

    const queries = {
      checkIns: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE punchtype = 'in' 
        AND date(punchdate) = date(?)
      `,
      checkOuts: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE punchtype = 'out' 
        AND date(punchdate) = date(?)
      `,
      synced: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE syncdate IS NOT NULL 
        AND date(punchdate) = date(?)
      `,
      notSynced: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE syncdate IS NULL 
        AND date(punchdate) = date(?)
      `,
    };

    const [inResult] = await db.executeSql(queries.checkIns, [today]);
    const [outResult] = await db.executeSql(queries.checkOuts, [today]);
    const [syncResult] = await db.executeSql(queries.synced, [today]);
    const [unsyncResult] = await db.executeSql(queries.notSynced, [today]);

    return {
      checkIns: inResult.rows.item(0).count || 0,
      checkOuts: outResult.rows.item(0).count || 0,
      synced: syncResult.rows.item(0).count || 0,
      notSynced: unsyncResult.rows.item(0).count || 0,
    };
  } catch (error) {
    console.error('[DashboardService] Stats error:', error);
    return {
      checkIns: 0,
      checkOuts: 0,
      synced: 0,
      notSynced: 0,
    };
  }
};

export const checkInitialSyncService = async () => {
  try {
    const db = await connectToDatabase();
    await createTables(db);

    const staffDatas = await getAllStaff(db);
    const lastSync = await AsyncStorage.getItem('lastsyncdate');

    if (staffDatas?.length === 0 && !lastSync) {
      return { needsSync: true };
    }

    return { needsSync: false };
  } catch (error) {
    console.error('[DashboardService] Sync check error:', error);
    return { needsSync: false };
  }
};

/* -------------------------------------------------------
   GET OVERALL SYNC STATS (ALL TIME)
------------------------------------------------------- */
export const getOverallSyncStatsService = async () => {
  try {
    const db = await connectToDatabase();
    await createTables(db);

    const queries = {
      total: `
        SELECT COUNT(*) as count 
        FROM punchrecord
      `,
      synced: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE syncdate IS NOT NULL
      `,
      notSynced: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE syncdate IS NULL
      `,

      totalCheckIns: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE punchtype = 'in'
      `,
      totalCheckOuts: `
        SELECT COUNT(*) as count 
        FROM punchrecord 
        WHERE punchtype = 'out'
      `,
    };

    const [totalResult] = await db.executeSql(queries.total);
    const [syncResult] = await db.executeSql(queries.synced);
    const [unsyncResult] = await db.executeSql(queries.notSynced);
    const [totalInResult] = await db.executeSql(queries.totalCheckIns);
    const [totalOutResult] = await db.executeSql(queries.totalCheckOuts);

    return {
      total: totalResult.rows.item(0).count || 0,
      synced: syncResult.rows.item(0).count || 0,
      notSynced: unsyncResult.rows.item(0).count || 0,

      totalCheckIns: totalInResult.rows.item(0).count || 0,
      totalCheckOuts: totalOutResult.rows.item(0).count || 0,
    };
  } catch (error) {
    console.error('[DashboardService] Overall stats error:', error);

    return {
      total: 0,
      synced: 0,
      notSynced: 0,

      totalCheckIns: 0,
      totalCheckOuts: 0,
    };
  }
};
