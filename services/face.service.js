// services/face.service.js

import { addFaceUpdate } from '../database/facevector_updates.repository';
import { getAllStaff, addStaff } from '../database/staff.repository';
import {
  getFaceEmbeddingFromImage,
  compressBase64Image,
} from '../utils/FaceRecognitionUtil';

// ────────────────────────────────────────────────
//  CONFIGURATION
// ────────────────────────────────────────────────
const FACE_MATCH_THRESHOLD = 0.60;
const BATCH_SIZE = 2000;

// In-memory vector cache
const VECTOR_STORE = {
  data: [],
  lastUpdated: null,
};

// ────────────────────────────────────────────────
//  LOAD VECTORS FROM DB (CACHE)
// ────────────────────────────────────────────────
export const loadVectorsService = async db => {
  try {
    const staffList = await getAllStaff(db);
    VECTOR_STORE.data = staffList
      .filter(item => item?.vector && item.vector !== 'null' && item.uuid)
      .map(item => ({ ...item, parsedVector: JSON.parse(item.vector) }));
    VECTOR_STORE.lastUpdated = new Date();
    return true;
  } catch {
    throw new Error('Failed to load face vectors from database');
  }
};

// ────────────────────────────────────────────────
//  COSINE SIMILARITY
// ────────────────────────────────────────────────
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA * magB);
  return magnitude === 0 ? 0 : dot / magnitude;
};

// NORMALIZE VECTOR
export const normalizeVector = v => {
  // Convert whatever-it-is to a proper dense array
  const vec = Array.from(v);

  if (!Array.isArray(vec) || vec.length === 0) {
    console.warn('normalizeVector: input could not be converted to array', v);
    return [];
  }

  let sumSq = 0;
  for (let x of vec) {
    sumSq += x * x;
  }
  const mag = Math.sqrt(sumSq) || 1; // fallback to 1 avoids NaN

  return vec.map(x => x / mag);
};

// ────────────────────────────────────────────────
//  BATCHED MATCHING
// ────────────────────────────────────────────────
const findMatchesInBatches = async embedding => {
  const matches = [];
  let bestScore = 0;

  const vectors = VECTOR_STORE.data;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);

    // Yield to event loop (prevent UI freeze on large DB)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    for (const item of batch) {
      const similarity = cosineSimilarity(embedding, item.parsedVector);

      if (similarity > bestScore) bestScore = similarity;

      if (similarity >= FACE_MATCH_THRESHOLD) {
        matches.push({
          uuid: item.uuid,
          name: item.name,
          staffid: item.staffid,
          similarity,
        });
      }
    }

    // Early exit if many matches (no need to scan all)
    if (matches.length > 10) break;
  }

  return { matches, bestScore };
};

// ────────────────────────────────────────────────
//  RECOGNIZE FACE (CAPTURE → EMBEDDING → MATCH)
// ────────────────────────────────────────────────
export const recognizeFaceService = async ({ cameraRef, switchCamera }) => {
  try {
    if (!cameraRef?.current) {
      throw new Error('Camera not ready');
    }

    if (VECTOR_STORE.data.length === 0) {
      throw new Error('No enrolled faces available');
    }

    // Capture fast photo
    const photo = await cameraRef.current.takePhoto({
      flash: 'off',
      qualityPrioritization: 'speed',
    });

    const filePath = photo.path.startsWith('file://')
      ? photo.path
      : `file://${photo.path}`;

    // Get embedding
    const embedding = await getFaceEmbeddingFromImage(
      filePath,
      switchCamera ? 'front' : 'back',
    );

    // const embedding = normalizeVector(rawEmbedding);

    // console.log(rawEmbedding, embedding);

    if (!embedding || typeof embedding === 'string') {
      throw new Error('No valid face detected in capture');
    }

    // Find matches
    const { matches, bestScore } = await findMatchesInBatches(embedding);

    if (matches.length === 0) {
      return {
        status: 'no_match',
        message: `Face not recognized (${(bestScore * 100).toFixed(1)}% match)`,
      };
    }

    if (matches.length === 1) {
      return {
        status: 'single',
        employee: matches[0],
      };
    }

    return {
      status: 'multiple',
      matches,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message || 'Recognition failed',
    };
  }
};

// ────────────────────────────────────────────────
//  ENROLL NEW FACE
// ────────────────────────────────────────────────
export const enrollFaceService = async ({
  db,
  staffData,
  imagePath,
  base64,
  cameraType,
}) => {
  try {
    if (!db) throw new Error('Database not initialized');
    if (!staffData?.guid || !staffData?.user?.emp_id) {
      throw new Error('Invalid staff information');
    }

    // Generate embedding
    const embedding = await getFaceEmbeddingFromImage(imagePath, cameraType);

    if (!embedding || typeof embedding === 'string') {
      throw new Error('No valid face detected');
    }

    // Duplicate check
    let highestScore = 0;
    let matchedEmployee = null;

    const staffList = await getAllStaff(db);

    for (const item of staffList ?? []) {
      if (!item.vector || item.vector === 'null') continue;

      const parsed = JSON.parse(item.vector);
      const similarity = cosineSimilarity(embedding, parsed);

      if (similarity > highestScore) {
        highestScore = similarity;
        matchedEmployee = item;
      }

      // Early exit if strong match found
      if (similarity >= FACE_MATCH_THRESHOLD) break;
    }

    if (
      highestScore >= FACE_MATCH_THRESHOLD &&
      matchedEmployee?.staffid !== staffData.user.emp_id
    ) {
      return {
        status: 'duplicate',
        message: `Face already enrolled for employee ${matchedEmployee.staffid}`,
      };
    }

    // Compress image
    const compressedImage = await compressBase64Image(base64);

    // Save to local DB
    await addStaff(db, {
      uuid: staffData.guid,
      staffid: staffData.user.emp_id,
      name: staffData.name,
      vector: JSON.stringify(embedding),
      img: compressedImage,
      enrollmode: 'online',
      createdby: staffData.guid,
      syncdate: null,
      sync_status: 0, // pending
    });

    // Update in-memory cache
    VECTOR_STORE.data.push({
      uuid: staffData.guid,
      name: staffData.name,
      staffid: staffData.user.emp_id,
      vector: JSON.stringify(embedding),
      parsedVector: embedding,
    });

    return {
      status: 'success',
      embedding,
      base64Image: `data:image/jpeg;base64,${compressedImage}`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message || 'Enrollment failed',
    };
  }
};

export const updateFaceService = async ({
  db,
  staffData,
  base64: referenceBase64,
  embedding: avgEmbedding,
  cameraType: cameraPosition,
}) => {
  try {
    console.log('===== FACE UPDATE START =====');

    console.log('DB:', db);
    console.log('Staff Data:', staffData);
    console.log('Embedding length:', avgEmbedding?.length);
    console.log('Camera:', cameraPosition);

    if (!db) {
      console.error('Database not initialized');
      throw new Error('Database not initialized');
    }

    if (!staffData?.guid || !staffData?.user?.emp_id) {
      console.error('Invalid staff info:', staffData);
      throw new Error('Invalid staff information');
    }

    if (!avgEmbedding || !Array.isArray(avgEmbedding)) {
      console.error('Invalid embedding:', avgEmbedding);
      throw new Error('Invalid embedding data');
    }

    console.log('Fetching staff list...');

    // let highestScore = 0;
    // let matchedEmployee = null;

    // const staffList = await getAllStaff(db);

    if (VECTOR_STORE.data.length === 0) {
      console.log('Vector store empty. Loading...');
      await loadVectorsService(db);
    }

    const { highestScore, matchedEmployee } = await findDuplicateFace(
      avgEmbedding,
      VECTOR_STORE.data,
      staffData.user.emp_id,
    );

    console.log('Highest similarity:', highestScore);

    if (highestScore >= FACE_MATCH_THRESHOLD) {
      console.warn('Duplicate face detected');
      return {
        status: 'duplicate',
        message: `Face already registered for employee ${matchedEmployee?.staffid}`,
      };
    }

    console.log('Compressing image...');

    const compressedImage = await compressBase64Image(referenceBase64);

    console.log('Image compressed. Size:', compressedImage?.length);

    console.log('Saving to staff table...');

    await addStaff(db, {
      uuid: staffData.guid,
      staffid: staffData.user.emp_id,
      name: staffData.name,
      vector: JSON.stringify(avgEmbedding),
      img: compressedImage,
      enrollmode: 'offline',
      createdby: staffData.guid,
    });

    console.log('Staff saved successfully');

    console.log('Adding sync queue entry...');

    await addFaceUpdate(db, {
      uuid: staffData.guid,
      staffid: staffData.user.emp_id,
      vector: JSON.stringify(avgEmbedding),
      img: compressedImage,
      action: 'update',
    });

    console.log('Sync queue added');

    console.log('Updating vector store cache...');

    const existingIndex = VECTOR_STORE.data.findIndex(
      v => v.staffid === staffData.user.emp_id,
    );

    const updatedVector = {
      uuid: staffData.guid,
      name: staffData.name,
      staffid: staffData.user.emp_id,
      vector: JSON.stringify(avgEmbedding),
      parsedVector: avgEmbedding,
    };

    if (existingIndex >= 0) {
      VECTOR_STORE.data[existingIndex] = updatedVector;
      console.log('Vector updated in cache');
    } else {
      VECTOR_STORE.data.push(updatedVector);
      console.log('Vector added to cache');
    }

    console.log('===== FACE UPDATE SUCCESS =====');

    return {
      status: 'success',
      embedding: avgEmbedding,
      base64Image: `data:image/jpeg;base64,${compressedImage}`,
      cameraType: cameraPosition,
    };
  } catch (error) {
    console.error('===== FACE UPDATE ERROR =====');
    console.error('Error message:', error.message);
    console.error('Full error:', error);

    return {
      status: 'error',
      message: error.message || 'Face update failed',
    };
  }
};

const findDuplicateFace = async (embedding, vectors, staffId) => {
  let highestScore = 0;
  let matchedEmployee = null;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);

    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    for (const item of batch) {
      if (item.staffid === staffId) continue;

      // const normVector = normalizeVector(item.parsedVector);
      const similarity = cosineSimilarity(embedding, item.parsedVector);

      if (similarity > highestScore) {
        highestScore = similarity;
        matchedEmployee = item;
      }

      if (similarity >= FACE_MATCH_THRESHOLD) {
        return { highestScore, matchedEmployee };
      }
    }
  }

  return { highestScore, matchedEmployee };
};
