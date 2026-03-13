// services/face.service.js

import { addFaceUpdate } from '../database/facevector_updates.repository';
import { getAllStaff, addStaff } from '../database/staff.repository';
import {
  getFaceEmbeddingFromImage,
  compressBase64Image,
} from '../utils/FaceRecognitionUtil';

import {
  buildHNSWIndex,
  ensureHNSWIndex,
  hasIndex,
  hnswSearch,
} from '../utils/hnswIndex';
// ────────────────────────────────────────────────
//  CONFIGURATION
// ────────────────────────────────────────────────
const FACE_MATCH_THRESHOLD = 0.45;
const BATCH_SIZE = 3000;

// RECOGNISE

let lastEmbedding = null;
let lastEmbeddingTimestamp = 0;
const EMBEDDING_CACHE_TTL_MS = 5000;

// In-memory vector cache
export const VECTOR_STORE = {
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

    // buildHNSWIndex(VECTOR_STORE.data);

    // await buildHNSWIndex();
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
  const vec = Array.from(v);
  let sqSum = 0;
  for (let i = 0; i < vec.length; i++) sqSum += vec[i] * vec[i];
  const invMag = 1.0 / (Math.sqrt(sqSum) + 1e-10);
  return vec.map(x => x * invMag);
};

// ────────────────────────────────────────────────
//  BATCHED MATCHING
// ────────────────────────────────────────────────
const findMatchesInBatches = async queryEmbedding => {
  return oldLinearSearch(queryEmbedding);

  // 1. Always normalize the query
  const normalizedQuery = normalizeVector(queryEmbedding);

  // 2. Sync Index
  await ensureHNSWIndex(VECTOR_STORE.lastUpdated?.getTime());

  if (!hasIndex()) {
    return oldLinearSearch(normalizedQuery);
  }

  // 3. Search KNN (k=10 is usually enough for face login)
  const { neighbors, distances } = await hnswSearch(normalizedQuery, 10);

  const matches = [];
  neighbors.forEach((dataIndex, pos) => {
    const item = VECTOR_STORE.data[dataIndex];
    if (!item) return;

    // In HNSW cosine, distance is (1 - similarity)
    // or sometimes score is direct similarity depending on the lib version
    const similarity = 1 - distances[pos];

    if (similarity >= FACE_MATCH_THRESHOLD) {
      matches.push({
        uuid: item.uuid,
        name: item.name,
        staffid: item.staffid,
        similarity,
      });
    }
  });

  matches.sort((a, b) => b.similarity - a.similarity);
  return { matches, bestScore: matches[0]?.similarity || 0 };
};

const oldLinearSearch = async embedding => {
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

    const now = Date.now();

    // ─── Try cache first ───
    // if (
    //   lastEmbedding &&
    //   now - lastEmbeddingTimestamp < EMBEDDING_CACHE_TTL_MS
    // ) {
    //   console.log(
    //     '[CACHE HIT] Reusing embedding from',
    //     (now - lastEmbeddingTimestamp) / 1000,
    //     'seconds ago',
    //   );

    //   const { matches, bestScore } = await findMatchesInBatches(lastEmbedding);

    //   if (matches.length === 0) {
    //     return {
    //       status: 'no_match',
    //       message: `Face not recognized (${(bestScore * 100).toFixed(
    //         1,
    //       )}% match)`,
    //     };
    //   }

    //   if (matches.length === 1) {
    //     return {
    //       status: 'single',
    //       employee: matches[0],
    //     };
    //   }

    //   return {
    //     status: 'multiple',
    //     matches,
    //   };
    // }

    // Capture fast photo
    const photo = await cameraRef.current.takePhoto({
      flash: 'off',
      qualityPrioritization: 'quality',
    });

    const filePath = photo.path.startsWith('file://')
      ? photo.path
      : `file://${photo.path}`;

    // Get embedding
    const emb1 = await getFaceEmbeddingFromImage(
      filePath,
      switchCamera ? 'front' : 'back',
    );

    // small delay to stabilize sensor
    await new Promise(r => setTimeout(r, 60));

    const emb2 = await getFaceEmbeddingFromImage(
      filePath,
      switchCamera ? 'front' : 'back',
    );

    // average embeddings
    const rawEmbedding = emb1.map((v, i) => (v + emb2[i]) / 2);

    // lastEmbedding = embedding;
    // lastEmbeddingTimestamp = now;

    const embedding = normalizeVector(rawEmbedding);

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
    // lastEmbedding = null;
    // lastEmbeddingTimestamp = 0;

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

    // ensureHNSWIndex(Date.now());

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
