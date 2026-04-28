# 07 — Background Sync Changes

The existing `backgroundSync.service.js` already handles:
1. Punch record sync → `POST /api/user-checkin-checkout`
2. Face vector sync → `POST /api/saveentrolledimage`

We extend #2 to also send the `recognition_source` and `confidence_score` with punch records,
and add CompreFace auto-enrollment inside the existing face sync path.

---

## Change 1 — Extend `syncVectorBackground` to auto-enroll in CompreFace

In `backgroundSync.service.js`, find `syncVectorBackground`.
After the successful `markFaceUpdatesSynced`, the server endpoint 
(`/api/saveentrolledimage`) now auto-enrolls in CompreFace (see doc 02).
No change needed in the mobile app for this.

---

## Change 2 — Add audit fields to punch sync payload

In `backgroundSync.service.js`, inside `runBackgroundSync`, the `formData.append` block
already sends punch fields. Add the new audit columns:

```javascript
// In runBackgroundSync(), inside the for (const record of pairedRecords) loop,
// after the existing formData.append calls, add:

formData.append('recognition_source', record.recognition_source || 'local');
formData.append('checkin_confidence', record.checkin_confidence || '');
formData.append('checkout_confidence', record.checkout_confidence || '');
formData.append('checkin_liveness', record.checkin_liveness || '');
formData.append('checkout_liveness', record.checkout_liveness || '');
```

---

## Change 3 — Pass audit fields through `pairPunchesSequentially`

The `formatPair`, `formatCheckIn`, and `formatCheckOut` functions in 
`attendance.service.js` format punch records. Add the new fields:

```javascript
// In attendance.service.js, update formatCheckIn:
export const formatCheckIn = (checkIn) => ({
  guid: checkIn.uuid,
  emp_id: checkIn.staffid || checkIn.uuid,
  project_id: checkIn.projectid,
  date: checkIn.punchdate?.split('T')[0] || checkIn.punchdate?.split(' ')[0],
  checkin_time: checkIn.punchdate,
  checkout_time: null,
  checkin_lat: checkIn.lat,
  checkin_lang: checkIn.lan,
  checkout_lat: null,
  checkout_lang: null,
  checkin_is_manual: checkIn.ismanual || 0,
  checkout_is_manual: 0,
  checkin_image: checkIn.userimage,
  checkout_image: null,
  local_ids: [checkIn.id],
  attendance_type: checkIn.attendancetype,
  // ─── NEW audit fields ───
  recognition_source: checkIn.recognition_source || 'local',
  checkin_confidence: checkIn.confidence_score || null,
  checkin_liveness: checkIn.liveness_score || null,
});

// Similarly update formatPair to include both checkin and checkout audit fields:
export const formatPair = (checkIn, checkOut) => ({
  // ... existing fields ...
  local_ids: [checkIn.id, checkOut.id],
  // ─── NEW audit fields ───
  recognition_source: checkIn.recognition_source || 'local',
  checkin_confidence: checkIn.confidence_score || null,
  checkin_liveness: checkIn.liveness_score || null,
  checkout_confidence: checkOut.confidence_score || null,
  checkout_liveness: checkOut.liveness_score || null,
});
```

---

## Change 4 — `getUnsyncedPunches` query (punch.repository.js)

Your `getUnsyncedPunches` query needs to SELECT the new columns so they're available
during sync formatting. Update the SELECT query:

```javascript
// In database/punch.repository.js, find getUnsyncedPunches and update the SQL:
export const getUnsyncedPunches = (db) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT id, uuid, projectid, punchtype, punchdate, lat, lan,
                attendancetype, punchmode, ismanual, userimage,
                recognition_source, confidence_score, liveness_score
         FROM punchrecord
         WHERE syncdate IS NULL
         ORDER BY punchdate ASC`,
        [],
        (_, { rows }) => resolve(rows._array || []),
        (_, error) => { reject(error); return true; }
      );
    });
  });
};
```

Also update `getPunchesByGroups` to include the new columns in its SELECT.
