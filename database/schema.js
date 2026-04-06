// database/schema.js

import { execute } from './helpers';

export const createTables = async db => {
  try {
    /* =====================================================
       PERFORMANCE PRAGMAS (VERY IMPORTANT)
    ===================================================== */

    await execute(db, `PRAGMA foreign_keys = ON`);
    await execute(db, `PRAGMA journal_mode = WAL`);
    await execute(db, `PRAGMA synchronous = NORMAL`);

    /* =====================================================
       USER PREFERENCES
    ===================================================== */

    await execute(
      db,
      `
      CREATE TABLE IF NOT EXISTS UserPreferences (
        id INTEGER PRIMARY KEY DEFAULT 1,
        colorPreference TEXT,
        languagePreference TEXT
      )
      `,
    );

    /* =====================================================
       STAFF / FACE VECTOR TABLE
    ===================================================== */

    await execute(
      db,
      `
      CREATE TABLE IF NOT EXISTS facevector (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        staffid TEXT,
        name TEXT,

        -- 🔹 Existing avg embedding (DO NOT REMOVE)
        vector TEXT,

        -- 🔥 NEW: multiple embeddings (JSON array)
        vectors TEXT,

        img TEXT,
        enrollmode TEXT DEFAULT 'online',
        createdby TEXT,
        syncdate DATETIME
      )
      `,
    );

    /* =====================================================
      FACE VECTOR UPDATE QUEUE (FOR API SYNC)
    ===================================================== */
    await execute(
      db,
      `
        CREATE TABLE IF NOT EXISTS facevector_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT NOT NULL,
          staffid TEXT,
          vector TEXT,

          -- 🔥 NEW: multiple embeddings (JSON array)
          vectors TEXT,

          img TEXT,
          action TEXT DEFAULT 'update', 
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          sync_status INTEGER DEFAULT 0,
          retry_count INTEGER DEFAULT 0,
          last_error TEXT,
          last_attempt DATETIME
        )
        `,
    );

    /* =====================================================
       PUNCH RECORD TABLE
       UUID COL => EMP_ID
    ===================================================== */

    await execute(
      db,
      `
      CREATE TABLE IF NOT EXISTS punchrecord (
        id TEXT PRIMARY KEY,
        uuid TEXT NOT NULL,
        projectid TEXT,
        punchtype TEXT CHECK(punchtype IN ('in','out')),
        punchdate DATETIME NOT NULL,
        lat TEXT,
        lan TEXT,
        attendancetype TEXT,
        punchmode TEXT DEFAULT 'offline',
        syncdate DATETIME DEFAULT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        last_attempt DATETIME,
        ismanual INTEGER DEFAULT 0,
        userimage TEXT
      )
      `,
    );

    /* =====================================================
       INDEXES (OPTIMIZED)
    ===================================================== */

    await execute(
      db,
      `CREATE INDEX IF NOT EXISTS idx_punch_uuid 
       ON punchrecord(uuid)`,
    );

    await execute(
      db,
      `CREATE INDEX IF NOT EXISTS idx_punch_uuid_date 
       ON punchrecord(uuid, punchdate)`,
    );

    await execute(
      db,
      `CREATE INDEX IF NOT EXISTS idx_punch_project 
       ON punchrecord(projectid)`,
    );

    await execute(
      db,
      `CREATE INDEX IF NOT EXISTS idx_punch_sync 
       ON punchrecord(syncdate)`,
    );

    await execute(
      db,
      `CREATE INDEX IF NOT EXISTS idx_facevector_uuid 
       ON facevector(uuid)`,
    );

    await execute(
      db,
      `CREATE INDEX IF NOT EXISTS idx_facevector_updates_sync
      ON facevector_updates(sync_status)`,
    );

    console.log('Database schema initialized successfully 🚀');
  } catch (error) {
    console.error('Schema creation error:', error);
    throw error;
  }
};
