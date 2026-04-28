# 04 — New File: `services/cloudFace.service.js`

Create this file at `services/cloudFace.service.js`.
It handles all cloud face operations (CompreFace + liveness). No changes to existing services yet.

---

```javascript
// services/cloudFace.service.js
//
// Handles CompreFace recognition and Silent-Face liveness checks.
// All calls go through your Node backend proxy — never directly to CompreFace.
// Falls back gracefully when the server is unreachable.

import { config } from '../config/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

const CLOUD_TIMEOUT_MS = 6000;
const CLOUD_RECOGNITION_KEY = 'CLOUD_RECOGNITION_ENABLED';

// ─── Feature flag ─────────────────────────────────────────────
export const isCloudRecognitionEnabled = async () => {
  const val = await AsyncStorage.getItem(CLOUD_RECOGNITION_KEY);
  return val === 'true';
};

export const setCloudRecognitionEnabled = async (enabled) => {
  await AsyncStorage.setItem(CLOUD_RECOGNITION_KEY, enabled ? 'true' : 'false');
};

// ─── Fetch with timeout ───────────────────────────────────────
const fetchWithTimeout = async (url, options, timeout = CLOUD_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

// ─── Convert file path to base64 ─────────────────────────────
export const filePathToBase64 = async (filePath) => {
  const cleanPath = filePath.startsWith('file://') ? filePath.slice(7) : filePath;
  return RNFS.readFile(cleanPath, 'base64');
};

/* =============================================================
   cloudRecognizeFace
   Send captured image to Node backend → CompreFace search.

   Returns:
   { status: 'match', empGuid, similarity, confidence } on match
   { status: 'no_match', highestSimilarity }             on miss
   { status: 'error', message }                          on failure
============================================================= */
export const cloudRecognizeFace = async ({ imageBase64, userToken }) => {
  try {
    const response = await fetchWithTimeout(
      `${config.Base_URL}/api/cloud/face/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ imageBase64 }),
      }
    );

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.matches?.length) {
      return {
        status: 'no_match',
        highestSimilarity: data.highestSimilarity || 0,
      };
    }

    const best = data.matches[0];

    return {
      status: 'match',
      empGuid: best.empGuid,
      similarity: best.similarity,
      similarityPercent: best.similarityPercent,
      allMatches: data.matches,
    };

  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    return {
      status: 'error',
      message: isTimeout ? 'Cloud search timed out' : error.message,
      timedOut: isTimeout,
    };
  }
};

/* =============================================================
   cloudEnrollFace
   Send face image to Node backend → CompreFace enrollment.

   Returns:
   { success: true, subject }   on success
   { success: false, error }    on failure
============================================================= */
export const cloudEnrollFace = async ({ empGuid, imageBase64, staffId, name, userToken }) => {
  try {
    const response = await fetchWithTimeout(
      `${config.Base_URL}/api/cloud/face/enroll`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ empGuid, imageBase64, staffId, name }),
      },
      10000 // enrollment can take longer
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Enroll failed: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, subject: data.subject };

  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =============================================================
   checkLiveness
   Run Silent-Face anti-spoofing on captured image.

   Returns:
   { isReal: true/false, confidence, label }  on success
   { isReal: null, error }                    on service failure
============================================================= */
export const checkLiveness = async ({ imageBase64, userToken }) => {
  try {
    const response = await fetchWithTimeout(
      `${config.Base_URL}/api/cloud/face/liveness`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ imageBase64 }),
      },
      5000
    );

    if (response.status === 503) {
      // Liveness service down — allow with null confidence (app decides)
      return { isReal: null, confidence: null, serviceDown: true };
    }

    if (!response.ok) {
      throw new Error(`Liveness error: ${response.status}`);
    }

    const data = await response.json();
    return {
      isReal: data.isReal,
      confidence: data.confidence,
      label: data.label,
    };

  } catch (error) {
    return { isReal: null, confidence: null, error: error.message };
  }
};

/* =============================================================
   deleteCloudFace
   Remove face from CompreFace (GDPR right to erasure).
============================================================= */
export const deleteCloudFace = async ({ empGuid, userToken }) => {
  try {
    const response = await fetchWithTimeout(
      `${config.Base_URL}/api/cloud/face/${empGuid}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` },
      }
    );

    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    const data = await response.json();
    return { success: true, deleted: data.deleted };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =============================================================
   checkCloudHealth
   Quick check if cloud services are reachable.
============================================================= */
export const checkCloudHealth = async () => {
  try {
    const response = await fetchWithTimeout(
      `${config.Base_URL}/api/cloud/face/health`,
      { method: 'GET' },
      3000
    );
    if (!response.ok) return { available: false };
    const data = await response.json();
    return { available: data.compreface && data.liveness, ...data };
  } catch (_) {
    return { available: false };
  }
};
```
