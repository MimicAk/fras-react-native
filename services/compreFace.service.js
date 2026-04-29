// services/compreFace.service.js
//
// CompreFace cloud face recognition — primary recognition path.

import { config } from '../config/config';
import { connectToDatabase } from '../database/connection';
import { getAllStaff } from '../database/staff.repository';

// ─── Constants ────────────────────────────────────────────────
const CF_RECOGNITION_THRESHOLD = 0.8; // minimum similarity to accept a match
const CF_TIMEOUT_MS = 6000;           // abort cloud call after 6 s

// ─── Staff Cache ──────────────────────────────────────────────
let _staffCache = null;

/** Lazy-loads all staff from DB on first call; returns cached array after that. */
const getStaffCache = async () => {
  if (_staffCache) return _staffCache;
  const db = await connectToDatabase();
  _staffCache = await getAllStaff(db);
  return _staffCache;
};

/** Call after enrollment so the next recognition picks up the new employee. */
export const cfRefreshStaffCache = () => { _staffCache = null; };

// ─── Helpers ──────────────────────────────────────────────────

/** Strip trailing slash so every endpoint concat is safe. */
const getBaseUrl = () => {
  const url = config.CF_BASE_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

/**
 * POST multipart/form-data to a CompreFace endpoint with an abort timeout.
 * Does NOT set Content-Type header — letting fetch set it with the correct
 * multipart boundary is required for FormData to work in React Native.
 */
const cfPost = (endpoint, formData) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CF_TIMEOUT_MS);

  return fetch(`${getBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': config.CF_API_KEY },
    body: formData,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
};

/** Build FormData from a photo file path (Vision Camera output). */
const buildFormData = photoPath => {
  const uri = photoPath.startsWith('file://')
    ? photoPath
    : `file://${photoPath}`;
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'face.jpg' });
  return form;
};

// ─── Public API ───────────────────────────────────────────────

/**
 * cfRecognizeFace
 *
 * Takes ONE photo via cameraRef, sends it to CompreFace, maps the returned
 * subject (empGuid) back to a DB staff record via staff.repository.
 *
 * Possible return values:
 *   { status: 'single',   employee, embedding: null, source: 'compreface' }
 *   { status: 'multiple', matches,  embedding: null, source: 'compreface' }
 *   { status: 'no_match', message }
 *   { status: 'error',    message }
 */
export const cfRecognizeFace = async ({ cameraRef }) => {
  if (!cameraRef?.current) {
    return { status: 'error', message: 'Camera not ready' };
  }

  // 1. Capture photo
  let photo;
  try {
    photo = await cameraRef.current.takePhoto({
      flash: 'off',
      qualityPrioritization: 'speed',
      skipMetadata: true,
    });
  } catch (err) {
    return { status: 'error', message: 'Failed to capture photo' };
  }

  // 2. Send to CompreFace recognize endpoint
  try {
    const formData = buildFormData(photo.path);
    const response = await cfPost(
      '/api/v1/recognition/recognize?limit=3&det_prob_threshold=0.8',
      formData,
    );

    if (!response.ok) {
      return { status: 'error', message: `CompreFace error: ${response.status}` };
    }

    const json = await response.json();
    const results = json?.result ?? [];


    console.log(json);

    // No face detected in the frame
    if (!results.length || !results[0]?.subjects?.length) {
      return { status: 'no_match', message: 'No face recognized' };
    }

    // 3. Filter by threshold, sort best first
    const aboveThreshold = results[0].subjects
      .filter(s => s.similarity >= CF_RECOGNITION_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity);

    if (!aboveThreshold.length) {
      const best = results[0].subjects[0];
      return {
        status: 'no_match',
        message: `Face not recognized (${(best.similarity * 100).toFixed(1)}% match)`,
      };
    }

    // 4. Resolve subjects to staff records (in-memory cache, loaded once from DB)
    const staffList = await getStaffCache();
    const employees = aboveThreshold
      .map(s => {
        const emp = staffList.find(e => e.uuid === s.subject);
        if (!emp) return null;
        return {
          uuid: emp.uuid,
          name: emp.name,
          staffid: emp.staffid,
          img: emp.img,
          similarity: parseFloat(s.similarity.toFixed(4)),
        };
      })
      .filter(Boolean);

    if (!employees.length) {
      return { status: 'no_match', message: 'Matched employee not found in DB' };
    }

    if (employees.length === 1) {
      return {
        status: 'single',
        employee: employees[0],
        embedding: null,
        source: 'compreface',
      };
    }

    return {
      status: 'multiple',
      matches: employees,
      embedding: null,
      source: 'compreface',
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    console.warn('[CF] Recognition failed:', isTimeout ? 'timeout' : err.message);
    return {
      status: 'error',
      message: isTimeout ? 'Recognition timed out' : (err.message || 'CompreFace error'),
    };
  }
};

/**
 * cfEnrollFace
 *
 * Enrolls a face into CompreFace using the employee's GUID as the subject.
 * Accepts a base64 string, writes a temp JPEG, sends as multipart, then cleans up.
 *
 * Returns { success: true, imageId } or { success: false, error }.
 */
export const cfEnrollFace = async ({ base64, empGuid }) => {
  if (!base64 || !empGuid) {
    return { success: false, error: 'Missing base64 or empGuid' };
  }

  let tmpPath = null;

  try {
    const RNFS = require('react-native-fs');

    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    tmpPath = `${RNFS.CachesDirectoryPath}/cf_enroll_${Date.now()}.jpg`;
    await RNFS.writeFile(tmpPath, cleanBase64, 'base64');

    const formData = buildFormData(tmpPath);
    const response = await cfPost(
      `/api/v1/recognition/faces?subject=${encodeURIComponent(empGuid)}`,
      formData,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `Enrollment failed (${response.status}): ${text}` };
    }

    const data = await response.json();
    console.log('[CF] Enrolled:', empGuid, '| imageId:', data?.image_id);
    return { success: true, imageId: data?.image_id };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? 'Enrollment timed out' : (err.message || 'Unknown error'),
    };
  } finally {
    if (tmpPath) {
      const RNFS = require('react-native-fs');
      RNFS.unlink(tmpPath).catch(() => {});
    }
  }
};

/**
 * cfDeleteFace
 *
 * Removes ALL images for an employee from CompreFace.
 * Returns { success: true, deleted } or { success: false, error }.
 */
export const cfDeleteFace = async empGuid => {
  if (!empGuid) {
    return { success: false, error: 'Missing empGuid' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CF_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${getBaseUrl()}/api/v1/recognition/faces?subject=${encodeURIComponent(empGuid)}`,
      {
        method: 'DELETE',
        headers: { 'x-api-key': config.CF_API_KEY },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { success: false, error: `Delete failed: ${response.status}` };
    }

    const data = await response.json();
    console.log('[CF] Deleted faces for:', empGuid);
    return { success: true, deleted: data?.faces?.deleted ?? 0 };
  } catch (err) {
    return {
      success: false,
      error: err.name === 'AbortError' ? 'Timed out' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
};
