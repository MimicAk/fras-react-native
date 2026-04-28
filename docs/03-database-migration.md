# 03 — Database Migration (SQLite Schema Changes)

These are **additive only** — no existing columns are removed. All `ALTER TABLE` calls
use `IF NOT EXISTS`-style guards so they are safe to run on first boot (idempotent).

---

## Changes to `database/schema.js`

Add the following blocks **after** the existing `CREATE TABLE` statements and **before** the indexes section.

### In `createTables()`, add after the facevector CREATE TABLE:

```javascript
// ── Cloud Face ID columns (CompreFace subject tracking) ──
await execute(db, `ALTER TABLE facevector ADD COLUMN cloud_subject_id TEXT`).catch(() => {});
await execute(db, `ALTER TABLE facevector ADD COLUMN cloud_enrolled_at DATETIME`).catch(() => {});
// .catch(() => {}) silently ignores "duplicate column" errors on re-runs
```

### After the punchrecord CREATE TABLE:

```javascript
// ── Audit columns for KYC-grade attendance ──
await execute(db, `ALTER TABLE punchrecord ADD COLUMN recognition_source TEXT DEFAULT 'local'`).catch(() => {});
await execute(db, `ALTER TABLE punchrecord ADD COLUMN confidence_score REAL`).catch(() => {});
await execute(db, `ALTER TABLE punchrecord ADD COLUMN liveness_score REAL`).catch(() => {});
```

### New `liveness_audit_log` table (add after the existing tables):

```javascript
await execute(
  db,
  `
  CREATE TABLE IF NOT EXISTS liveness_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_uuid    TEXT,
    result      TEXT,
    confidence  REAL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    punch_id    TEXT
  )
  `
);

await execute(
  db,
  `CREATE INDEX IF NOT EXISTS idx_liveness_emp
   ON liveness_audit_log(emp_uuid)`
);
```

---

## Full Updated `schema.js` Reference

Below is the complete updated file. **Replace `database/schema.js` with this:**

```javascript
// database/schema.js

import { execute } from './helpers';

export const createTables = async db => {
  try {
    /* =====================================================
       PERFORMANCE PRAGMAS
    ===================================================== */
    await execute(db, `PRAGMA foreign_keys = ON`);
    await execute(db, `PRAGMA journal_mode = WAL`);
    await execute(db, `PRAGMA synchronous = NORMAL`);

    /* =====================================================
       USER PREFERENCES
    ===================================================== */
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS UserPreferences (
        id INTEGER PRIMARY KEY DEFAULT 1,
        colorPreference TEXT,
        languagePreference TEXT
      )`
    );

    /* =====================================================
       STAFF / FACE VECTOR TABLE
    ===================================================== */
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS facevector (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid       TEXT UNIQUE NOT NULL,
        staffid    TEXT,
        name       TEXT,
        vector     TEXT,
        vectors    TEXT,
        img        TEXT,
        enrollmode TEXT DEFAULT 'online',
        createdby  TEXT,
        syncdate   DATETIME
      )`
    );

    // Cloud columns (added safely — ignore if already exist)
    await execute(db, `ALTER TABLE facevector ADD COLUMN cloud_subject_id TEXT`).catch(() => {});
    await execute(db, `ALTER TABLE facevector ADD COLUMN cloud_enrolled_at DATETIME`).catch(() => {});

    /* =====================================================
       FACE VECTOR UPDATE QUEUE
    ===================================================== */
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS facevector_updates (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid        TEXT NOT NULL,
        staffid     TEXT,
        vector      TEXT,
        vectors     TEXT,
        img         TEXT,
        action      TEXT DEFAULT 'update',
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        last_error  TEXT,
        last_attempt DATETIME
      )`
    );

    /* =====================================================
       PUNCH RECORD TABLE
    ===================================================== */
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS punchrecord (
        id               TEXT PRIMARY KEY,
        uuid             TEXT NOT NULL,
        projectid        TEXT,
        punchtype        TEXT CHECK(punchtype IN ('in','out')),
        punchdate        DATETIME NOT NULL,
        lat              TEXT,
        lan              TEXT,
        attendancetype   TEXT,
        punchmode        TEXT DEFAULT 'offline',
        syncdate         DATETIME DEFAULT NULL,
        retry_count      INTEGER DEFAULT 0,
        last_error       TEXT,
        last_attempt     DATETIME,
        ismanual         INTEGER DEFAULT 0,
        userimage        TEXT
      )`
    );

    // Audit columns (added safely)
    await execute(db, `ALTER TABLE punchrecord ADD COLUMN recognition_source TEXT DEFAULT 'local'`).catch(() => {});
    await execute(db, `ALTER TABLE punchrecord ADD COLUMN confidence_score REAL`).catch(() => {});
    await execute(db, `ALTER TABLE punchrecord ADD COLUMN liveness_score REAL`).catch(() => {});

    /* =====================================================
       LIVENESS AUDIT LOG (NEW)
    ===================================================== */
    await execute(
      db,
      `CREATE TABLE IF NOT EXISTS liveness_audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_uuid   TEXT,
        result     TEXT,
        confidence REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        punch_id   TEXT
      )`
    );

    /* =====================================================
       INDEXES
    ===================================================== */
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_punch_uuid ON punchrecord(uuid)`);
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_punch_uuid_date ON punchrecord(uuid, punchdate)`);
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_punch_project ON punchrecord(projectid)`);
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_punch_sync ON punchrecord(syncdate)`);
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_facevector_uuid ON facevector(uuid)`);
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_facevector_updates_sync ON facevector_updates(sync_status)`);
    await execute(db, `CREATE INDEX IF NOT EXISTS idx_liveness_emp ON liveness_audit_log(emp_uuid)`);

    console.log('Database schema initialized successfully 🚀');
  } catch (error) {
    console.error('Schema creation error:', error);
    throw error;
  }
};
```

---

## Update `punch.repository.js` — Add Audit Columns to INSERT

Find the `recordPunch` (or `insertPunch`) function and add the new columns:

```javascript
// In database/punch.repository.js
// Find your existing INSERT statement and extend it:

export const recordPunch = (db, punch) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `INSERT OR REPLACE INTO punchrecord
          (id, uuid, projectid, punchtype, punchdate, lat, lan,
           attendancetype, punchmode, ismanual, userimage,
           recognition_source, confidence_score, liveness_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          punch.id,
          punch.uuid,
          punch.projectid,
          punch.punchtype,
          punch.punchdate,
          punch.lat,
          punch.lan,
          punch.attendancetype,
          punch.punchmode || 'offline',
          punch.ismanual ? 1 : 0,
          punch.userimage || null,
          punch.recognition_source || 'local',   // NEW
          punch.confidence_score || null,         // NEW
          punch.liveness_score || null,           // NEW
        ],
        (_, result) => resolve(result),
        (_, error) => { reject(error); return true; }
      );
    });
  });
};
```
