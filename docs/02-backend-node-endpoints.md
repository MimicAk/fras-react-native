# 02 — Backend Node.js Endpoints

Add these to your existing Express server. All proxy to CompreFace and Silent-Face internally.
All existing endpoints (`/api/login`, `/api/getallvectors`, etc.) remain unchanged.

---

## Environment Variables (`.env`)

```env
COMPREFACE_URL=http://localhost:8000
COMPREFACE_API_KEY=your-compreface-api-key-here
LIVENESS_URL=http://localhost:8001
LIVENESS_THRESHOLD=0.7
RECOGNITION_THRESHOLD=0.80
```

---

## Install Dependencies

```bash
npm install axios form-data
```

---

## `routes/cloudFace.routes.js`

Create this file in your Node backend:

```javascript
const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');

const COMPREFACE_URL = process.env.COMPREFACE_URL || 'http://localhost:8000';
const COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY;
const LIVENESS_URL = process.env.LIVENESS_URL || 'http://localhost:8001';
const LIVENESS_THRESHOLD = parseFloat(process.env.LIVENESS_THRESHOLD || '0.7');
const RECOGNITION_THRESHOLD = parseFloat(process.env.RECOGNITION_THRESHOLD || '0.80');

// Auth middleware — reuse whatever your existing routes use
const authMiddleware = require('../middleware/auth');

/* ================================================================
   POST /api/cloud/face/enroll
   Enroll a face into CompreFace recognition service.
   Body: { empGuid, imageBase64, staffId, name }
================================================================ */
router.post('/enroll', authMiddleware, async (req, res) => {
  try {
    const { empGuid, imageBase64, staffId, name } = req.body;

    if (!empGuid || !imageBase64) {
      return res.status(400).json({ error: 'empGuid and imageBase64 required' });
    }

    // Convert base64 to buffer
    const base64Data = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Build multipart form for CompreFace
    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: `${empGuid}.jpg`,
      contentType: 'image/jpeg',
    });

    // CompreFace uses "subject" as the identifier — we use empGuid
    const response = await axios.post(
      `${COMPREFACE_URL}/api/v1/recognition/faces?subject=${empGuid}`,
      form,
      {
        headers: {
          'x-api-key': COMPREFACE_API_KEY,
          ...form.getHeaders(),
        },
        timeout: 10000,
      }
    );

    const faceData = response.data;

    // Optionally: update your DB record to store cloud enrollment status
    // await db.query(
    //   'UPDATE staff SET cloud_enrolled_at = NOW() WHERE guid = ?',
    //   [empGuid]
    // );

    return res.json({
      success: true,
      subject: empGuid,
      imageId: faceData.image_id,
    });

  } catch (error) {
    console.error('[CLOUD ENROLL ERROR]', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Enrollment failed',
      detail: error.response?.data || error.message,
    });
  }
});

/* ================================================================
   POST /api/cloud/face/search
   Recognize a face against enrolled subjects.
   Body: { imageBase64 }
   Returns: { matches: [{ empGuid, similarity }], highestSimilarity }
================================================================ */
router.post('/search', authMiddleware, async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required' });
    }

    const base64Data = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: 'query.jpg',
      contentType: 'image/jpeg',
    });

    const response = await axios.post(
      `${COMPREFACE_URL}/api/v1/recognition/recognize?limit=5&det_prob_threshold=0.8`,
      form,
      {
        headers: {
          'x-api-key': COMPREFACE_API_KEY,
          ...form.getHeaders(),
        },
        timeout: 8000,
      }
    );

    // CompreFace response: { result: [{ subjects: [{ subject, similarity }], box }] }
    const results = response.data?.result || [];

    if (!results.length || !results[0].subjects?.length) {
      return res.json({
        matches: [],
        highestSimilarity: 0,
        noFaceDetected: !results.length,
      });
    }

    // Map subjects to app-friendly format
    const subjects = results[0].subjects;
    const matches = subjects
      .filter(s => s.similarity >= RECOGNITION_THRESHOLD)
      .map(s => ({
        empGuid: s.subject,
        similarity: parseFloat(s.similarity.toFixed(4)),
        similarityPercent: parseFloat((s.similarity * 100).toFixed(1)),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const highestSimilarity = subjects[0]?.similarity || 0;

    return res.json({
      matches,
      highestSimilarity,
      box: results[0].box,
    });

  } catch (error) {
    console.error('[CLOUD SEARCH ERROR]', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Face search failed',
      detail: error.response?.data || error.message,
    });
  }
});

/* ================================================================
   POST /api/cloud/face/liveness
   Check if the captured face is a real person (anti-spoofing).
   Body: { imageBase64 }
   Returns: { isReal, confidence, label }
================================================================ */
router.post('/liveness', authMiddleware, async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required' });
    }

    const response = await axios.post(
      `${LIVENESS_URL}/check`,
      { imageBase64 },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );

    const { isReal, confidence, label } = response.data;

    return res.json({
      isReal: isReal && confidence >= LIVENESS_THRESHOLD,
      confidence,
      label,
      threshold: LIVENESS_THRESHOLD,
    });

  } catch (error) {
    console.error('[LIVENESS ERROR]', error.response?.data || error.message);
    // On liveness service failure — return uncertain, let app decide
    return res.status(503).json({
      error: 'Liveness service unavailable',
      isReal: null,
    });
  }
});

/* ================================================================
   DELETE /api/cloud/face/:empGuid
   Remove all face images for an employee (GDPR right to erasure).
================================================================ */
router.delete('/:empGuid', authMiddleware, async (req, res) => {
  try {
    const { empGuid } = req.params;

    const response = await axios.delete(
      `${COMPREFACE_URL}/api/v1/recognition/faces?subject=${empGuid}`,
      {
        headers: { 'x-api-key': COMPREFACE_API_KEY },
        timeout: 5000,
      }
    );

    return res.json({
      success: true,
      deleted: response.data?.faces?.deleted || 0,
      subject: empGuid,
    });

  } catch (error) {
    console.error('[CLOUD DELETE ERROR]', error.response?.data || error.message);
    return res.status(500).json({ error: 'Delete failed' });
  }
});

/* ================================================================
   GET /api/cloud/face/subjects
   List all enrolled subjects (for migration/audit).
================================================================ */
router.get('/subjects', authMiddleware, async (req, res) => {
  try {
    const response = await axios.get(
      `${COMPREFACE_URL}/api/v1/recognition/subjects`,
      {
        headers: { 'x-api-key': COMPREFACE_API_KEY },
        timeout: 5000,
      }
    );

    return res.json({ subjects: response.data?.subjects || [] });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list subjects' });
  }
});

/* ================================================================
   POST /api/cloud/face/health
   Check if CompreFace and liveness services are up.
================================================================ */
router.get('/health', async (req, res) => {
  const results = { compreface: false, liveness: false };

  try {
    await axios.get(`${COMPREFACE_URL}/actuator/health`, { timeout: 3000 });
    results.compreface = true;
  } catch (_) {}

  try {
    await axios.get(`${LIVENESS_URL}/health`, { timeout: 3000 });
    results.liveness = true;
  } catch (_) {}

  return res.json(results);
});

module.exports = router;
```

---

## Register Routes in `app.js` / `server.js`

```javascript
const cloudFaceRoutes = require('./routes/cloudFace.routes');

// Add after your existing routes
app.use('/api/cloud/face', cloudFaceRoutes);
```

---

## Extend Existing `/api/saveentrolledimage`

Your existing enrollment sync endpoint (called by `backgroundSync.service.js`) needs to also enroll in CompreFace. Add this after saving to your DB:

```javascript
// Inside your existing /api/saveentrolledimage handler
// After saving vector/image to DB:

const axios = require('axios');
const FormData = require('form-data');

try {
  // Auto-enroll in CompreFace if not already enrolled
  const base64Data = req.body.blob.includes(',')
    ? req.body.blob.split(',')[1]
    : req.body.blob;
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const form = new FormData();
  form.append('file', imageBuffer, { filename: `${req.body.empguid}.jpg`, contentType: 'image/jpeg' });

  await axios.post(
    `${process.env.COMPREFACE_URL}/api/v1/recognition/faces?subject=${req.body.empguid}`,
    form,
    {
      headers: { 'x-api-key': process.env.COMPREFACE_API_KEY, ...form.getHeaders() },
      timeout: 10000,
    }
  );
  console.log(`[COMPREFACE] Enrolled ${req.body.empguid}`);
} catch (cfError) {
  // Non-fatal — local DB save still succeeded
  console.warn('[COMPREFACE] Auto-enroll failed (non-fatal):', cfError.message);
}
```

---

## Migration Script (Run Once)

Save as `scripts/migrate-to-compreface.js` on your server. Enrolls every existing employee into CompreFace using their stored face image.

```javascript
// scripts/migrate-to-compreface.js
// Run: node scripts/migrate-to-compreface.js

const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const COMPREFACE_URL = process.env.COMPREFACE_URL;
const COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY;
const DB = require('../config/database'); // your DB connection

async function migrateEmployee(emp) {
  if (!emp.image || !emp.guid) return { skip: true, reason: 'no image' };

  try {
    // Check if already enrolled
    const existing = await axios.get(
      `${COMPREFACE_URL}/api/v1/recognition/faces?subject=${emp.guid}`,
      { headers: { 'x-api-key': COMPREFACE_API_KEY }, timeout: 5000 }
    );
    if (existing.data?.faces?.length > 0) {
      return { skip: true, reason: 'already enrolled' };
    }
  } catch (_) {}

  const base64Data = emp.image.includes(',') ? emp.image.split(',')[1] : emp.image;
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const form = new FormData();
  form.append('file', imageBuffer, { filename: `${emp.guid}.jpg`, contentType: 'image/jpeg' });

  const response = await axios.post(
    `${COMPREFACE_URL}/api/v1/recognition/faces?subject=${emp.guid}`,
    form,
    {
      headers: { 'x-api-key': COMPREFACE_API_KEY, ...form.getHeaders() },
      timeout: 10000,
    }
  );

  return { success: true, imageId: response.data.image_id };
}

async function runMigration() {
  // Fetch all employees from your DB
  // Adjust the query to match your schema
  const employees = await DB.query('SELECT guid, emp_id, name, image FROM enrolled_staff WHERE image IS NOT NULL');

  console.log(`Migrating ${employees.length} employees...`);

  let success = 0, skipped = 0, failed = 0;
  const failedList = [];

  for (const emp of employees) {
    try {
      const result = await migrateEmployee(emp);
      if (result.skip) { skipped++; continue; }
      success++;
      console.log(`✅ ${emp.emp_id} — enrolled`);
    } catch (error) {
      failed++;
      failedList.push({ emp_id: emp.emp_id, error: error.response?.data?.message || error.message });
      console.error(`❌ ${emp.emp_id} — ${error.message}`);
    }

    // Small delay to avoid overwhelming CompreFace
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone. ✅ ${success} enrolled | ⏭ ${skipped} skipped | ❌ ${failed} failed`);
  if (failedList.length) {
    console.log('\nFailed employees (need manual re-enrollment):');
    console.table(failedList);
  }
}

runMigration().catch(console.error);
```

Run it:

```bash
cd /your/node/backend
node scripts/migrate-to-compreface.js
```
