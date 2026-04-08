// services/face.service.js

import { addFaceUpdate } from '../database/facevector_updates.repository';
import {
  getAllStaff,
  addStaff,
  getStaffByCreatedBy,
} from '../database/staff.repository';
import {
  getFaceEmbeddingFromImage,
  compressBase64Image,
} from '../utils/FaceRecognitionUtil';

import { faceIndexManager } from '../utils/hnswIndex';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSetting } from '../utils/settings.helper';

// ────────────────────────────────────────────────
//  CONFIGURATION
// ────────────────────────────────────────────────
const getFaceSettings = () => ({
  matchThreshold: getSetting('FACE_MATCH_THRESHOLD'),
  recognitionThreshold: getSetting('RECOGNITION_THRESHOLD'),
  duplicateThreshold: getSetting('ENROLLMENT_DUPLICATE_THRESHOLD'),
  updateThreshold: getSetting('TEMPLATE_UPDATE_THRESHOLD'),
  batchSize: getSetting('BATCH_SIZE'),
  captureCount: getSetting('CAPTURE_COUNT'),
});

// VECTOR STORAGE KEY
const VECTOR_VERSION_KEY = 'FACE_VECTOR_VERSION';

// RECOGNISE
let lastEmbedding = null;
let lastEmbeddingTimestamp = 0;
const EMBEDDING_CACHE_TTL_MS = 5000;

let SEARCH_COUNT = 0;
const USER_ONLY_SEARCH_LIMIT = 3;

setInterval(() => {
  SEARCH_COUNT = 0;
  console.log('[SEARCH] Counter reset');
}, 5 * 60 * 1000);

// In-memory vector cache
export const VECTOR_STORE = {
  data: [],
  userData: [],
  lastUpdated: null,
};

let CURRENT_USER = {
  staffid: null,
};

export const setCurrentUser = user => {
  CURRENT_USER = user;
};

export const getCurrentUser = () => CURRENT_USER;

// ────────────────────────────────────────────────
//  LOAD VECTORS FROM DB (CACHE)
// ────────────────────────────────────────────────
export const loadVectorsService = async db => {
  try {
    const storedVersion = await AsyncStorage.getItem(VECTOR_VERSION_KEY);
    const now = Date.now();

    // ⛔ Skip if loaded within last 1 hour
    // if (storedVersion) {
    //   const lastLoaded = Number(storedVersion);
    //   const duration = 5 * 60 * 1000;

    //   if (now - lastLoaded < duration) {
    //     console.log(`[FACE] Skipping load (${duration})`);
    //     return false;
    //   }
    // }

    const currentUser = getCurrentUser();

    const [createdByList, staffList] = await Promise.all([
      getStaffByCreatedBy(db, currentUser),
      getAllStaff(db),
    ]);

    console.log(createdByList);

    VECTOR_STORE.userData = mapVectorData(createdByList);

    VECTOR_STORE.data = mapVectorData(staffList);

    console.log('VECTOR_STORE');
    console.log(VECTOR_STORE.userData);

    VECTOR_STORE.lastUpdated = storedVersion
      ? Number(storedVersion)
      : Date.now();

    // Fire & Forget: Build the high-speed index in the background
    // setTimeout(() => {
    //   if (faceIndexManager.hasIndex()) return;
    //   console.log('[FACE] Starting lazy HNSW build in background');
    //   faceIndexManager
    //     .buildIndex(VECTOR_STORE.data, VECTOR_STORE.lastUpdated)
    //     .catch(err =>
    //       console.log('[HNSW] Lazy build failed (non-critical)', err),
    //     );
    // }, 3000);

    return true;
  } catch (error) {
    console.error('[FACE] loadVectorsService error:', error);
    throw new Error('Failed to load face vectors from database');
  }
};

const mapVectorData = list => {
  return list
    .filter(
      item =>
        item?.vector &&
        item.vector !== 'null' &&
        item.uuid &&
        item.staffid !== '',
    )
    .map(item => {
      const parsedAvg = safeParse(item.vector);
      let parsedVectors = safeParse(item.vectors);

      console.log(typeof item.vector);
      console.log(item.vector.length);
      console.log('parsed');

      // console.log(parsedVectors);
      console.log(parsedAvg.length);

      if (
        Array.isArray(parsedAvg) &&
        parsedAvg.length === 1 &&
        Array.isArray(parsedAvg[0])
      ) {
        parsedAvg = parsedAvg[0];
      }

      if (!Array.isArray(parsedVectors)) parsedVectors = [];

      if (parsedVectors.length === 0 && parsedAvg.length === 512) {
        console.error('❌ INVALID AVG VECTOR:', parsedAvg);
        parsedVectors = [parsedAvg];
      }

      return {
        ...item,
        avgVector: parsedAvg,
        parsedVector: parsedVectors,
      };
    });
};

const safeParse = val => {
  try {
    let parsed = typeof val === 'string' ? JSON.parse(val) : val;

    // 🔥 DOUBLE PARSE FIX
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }

    return parsed;
  } catch {
    return [];
  }
};

// ────────────────────────────────────────────────
//  COSINE SIMILARITY
// ────────────────────────────────────────────────
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== 512 || b.length !== 512) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < 512; i++) {
    const valA = a[i];
    const valB = b[i];
    dot += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  }

  const magnitude = Math.sqrt(magA * magB) + 1e-10;
  return dot / magnitude;
};

const getBestSimilarity = (query, vectors = []) => {
  if (!vectors || !vectors.length) return 0;

  let best = 0;

  for (const v of vectors) {
    const sim = cosineSimilarity(query, v);
    if (sim > best) {
      best = sim;
    }
  }

  return best;
};

// NORMALIZE VECTOR
export const normalizeVector = v => {
  const vec = Array.from(v);
  let sqSum = 0;
  for (let i = 0; i < vec.length; i++) sqSum += vec[i] * vec[i];
  const invMag = 1.0 / (Math.sqrt(sqSum) + 1e-10);
  return vec.map(x => x * invMag);
};

export const blendAndNormalizeVectors = (oldVector, newVector, alpha = 0.9) => {
  const oldArr = Array.from(oldVector);
  const newArr = Array.from(newVector);
  const blended = oldArr.map((val, i) => alpha * val + (1 - alpha) * newArr[i]);
  return normalizeVector(blended);
};

// ────────────────────────────────────────────────
//  BATCHED MATCHING
// ────────────────────────────────────────────────
// ────────────────────────────────────────────────
//   BATCHED MATCHING (with Linear Fallback)
// ────────────────────────────────────────────────
const findMatchesInBatches = async queryEmbedding => {
  const { recognitionThreshold } = getFaceSettings();
  const normalizedQuery = queryEmbedding; //already normalized

  return oldLinearSearch(normalizedQuery);

  if (!faceIndexManager.hasIndex() && !faceIndexManager.isIndexBuilding()) {
    // Start building now if not started yet (progressive start)
    faceIndexManager
      .buildIndex(VECTOR_STORE.data, VECTOR_STORE.lastUpdated)
      .catch(() => {});
  }

  // return oldLinearSearch(normalizedQuery);

  console.log('hasIndex:', faceIndexManager.hasIndex());
  console.log('isBuilding:', faceIndexManager.isIndexBuilding());
  // Fallback to old scan if HNSW isn't ready or built yet
  if (!faceIndexManager.hasIndex() || faceIndexManager.isIndexBuilding()) {
    return oldLinearSearch(normalizedQuery);
  }

  // Fast HNSW Search
  const { neighbors, distances } = await faceIndexManager.search(
    normalizedQuery,
    10,
  );
  const matches = [];

  console.log('HNSW raw results', neighbors, distances);

  neighbors.forEach((dataIndex, pos) => {
    const item = VECTOR_STORE.data[dataIndex];
    if (!item) return;

    // Convert distance to similarity if needed (depends on underlying HNSW lib logic)
    // Assuming distance is inner product / cosine distance (1 - similarity)
    const similarity = distances[pos];

    if (similarity >= recognitionThreshold) {
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
  const { batchSize, updateThreshold, matchThreshold } = getFaceSettings();
  SEARCH_COUNT++;

  const useUserOnly = SEARCH_COUNT <= USER_ONLY_SEARCH_LIMIT;

  const vectors = useUserOnly ? VECTOR_STORE.userData : VECTOR_STORE.data;

  const matches = [];

  let bestScore = 0;
  let bestMatch = null;

  for (let i = 0; i < vectors.length; i += batchSize) {
    const end = Math.min(i + batchSize, vectors.length);

    // Yield to event loop
    if (i > 0) {
      await new Promise(r => setTimeout(r, 0));
    }

    for (let j = i; j < end; j++) {
      const item = vectors[j];

      const similarity = getBestSimilarity(embedding, item.parsedVector);

      // Track best match
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = item;

        // Early exit if very strong match
        if (bestScore > 0.7) {
          return {
            matches: [
              {
                uuid: item.uuid,
                name: item.name,
                staffid: item.staffid,
                similarity: bestScore,
                img: item.img,
              },
            ],
            bestScore,
          };
        }
      }

      // Add match
      if (similarity >= updateThreshold && similarity > matchThreshold) {
        matches.push({
          uuid: item.uuid,
          name: item.name,
          staffid: item.staffid,
          similarity,
        });

        // Stop collecting too many matches
        if (matches.length >= 5) {
          return { matches, bestScore };
        }
      }
    }
  }

  // If no threshold match but bestScore exists
  if (matches.length === 0 && bestMatch) {
    return {
      matches: [],
      bestScore,
    };
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

    // Pull the dynamic capture count setting (1, 2, or 3)
    const { captureCount } = getFaceSettings();
    const photos = [];
    const embeddings = [];

    // ─── 1. CAPTURE PHASE ───
    for (let i = 0; i < captureCount; i++) {
      // Add a small delay between snaps to stabilize sensor (skip on first snap)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'speed',
      });
      photos.push(photo);
    }

    // ─── 2. EMBEDDING PHASE ───
    for (let i = 0; i < photos.length; i++) {
      // Small delay to stabilize processing thread (skip on first embedding)
      if (i > 0) {
        await new Promise(r => setTimeout(r, 60));
      }

      const filePath = photos[i].path.startsWith('file://')
        ? photos[i].path
        : `file://${photos[i].path}`;

      const emb = await getFaceEmbeddingFromImage(
        filePath,
        switchCamera ? 'front' : 'back',
      );

      if (!emb || typeof emb === 'string') {
        throw new Error(`Face not detected properly on snap ${i + 1}`);
      }

      embeddings.push(emb);
    }

    // ─── 3. AVERAGING PHASE ───
    let rawEmbedding = embeddings[0];

    // If more than 1 snap, average them dynamically
    if (embeddings.length > 1) {
      rawEmbedding = rawEmbedding.map((val, idx) => {
        let sum = val;
        for (let j = 1; j < embeddings.length; j++) {
          sum += embeddings[j][idx];
        }
        return sum / embeddings.length;
      });
    }

    const embedding = normalizeVector(rawEmbedding);

    if (!embedding || typeof embedding === 'string') {
      throw new Error('No valid face detected in capture');
    }

    // ─── 4. MATCHING PHASE ───
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
        embedding: embedding,
      };
    }

    return {
      status: 'multiple',
      matches,
      embedding: embedding,
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
    const { matchThreshold } = getFaceSettings();

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
      if (similarity >= matchThreshold) break;
    }

    if (
      highestScore >= matchThreshold &&
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
  vectors: newVectors,
  cameraType: cameraPosition,
  skipDuplicationCheck = false,
}) => {
  try {
    const { duplicateThreshold } = getFaceSettings();

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

    if (!skipDuplicationCheck) {
      const { highestScore, matchedEmployee } = await findDuplicateFace(
        avgEmbedding,
        VECTOR_STORE.data,
        staffData.user.emp_id,
      );

      console.log('Highest similarity:', highestScore);

      if (highestScore >= duplicateThreshold) {
        console.warn('Duplicate face detected');
        return {
          status: 'duplicate',
          message: `Face already registered for employee ${matchedEmployee?.staffid},  Are you sure to continue?`,
        };
      }
    }

    console.log('Compressing image...');

    const compressedImage = await compressBase64Image(referenceBase64);

    console.log('Image compressed. Size:', compressedImage?.length);

    console.log('Saving to staff table...');

    let vectors = [];

    // existing user vectors
    const existing = VECTOR_STORE.data.find(
      v => v.staffid === staffData.user.emp_id,
    );

    if (existing?.parsedVector?.length) {
      vectors = [...existing.parsedVector];
    }

    // 🔥 add new 3 embeddings (not avg)
    if (Array.isArray(newVectors)) {
      vectors.push(...newVectors);
    }

    // 🔥 limit
    const MAX = 5;
    if (vectors.length > MAX) {
      vectors = vectors.slice(-MAX);
    }

    const currentUser = getCurrentUser();

    await addStaff(db, {
      uuid: staffData.guid,
      staffid: staffData.user.emp_id,
      name: staffData.name,
      vector: JSON.stringify(avgEmbedding),
      vectors: JSON.stringify(vectors),
      img: compressedImage,
      enrollmode: 'offline',
      createdby: currentUser,
    });

    console.log('Staff saved successfully');

    console.log('Adding sync queue entry...');

    await addFaceUpdate(db, {
      uuid: staffData.guid,
      staffid: staffData.user.emp_id,
      vector: JSON.stringify(avgEmbedding),
      vectors: JSON.stringify(vectors),
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
      parsedVector: vectors,
    };

    if (existingIndex >= 0) {
      VECTOR_STORE.data[existingIndex] = updatedVector;
      console.log('Vector updated in cache');
    } else {
      VECTOR_STORE.data.push(updatedVector);
      console.log('Vector added to cache');
    }

    const newVersion = Date.now();

    await AsyncStorage.setItem(VECTOR_VERSION_KEY, String(newVersion));

    VECTOR_STORE.lastUpdated = newVersion;

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
  const { batchSize, duplicateThreshold } = getFaceSettings();
  let highestScore = 0;
  let matchedEmployee = null;

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);

    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    for (const item of batch) {
      if (item.staffid === staffId) continue;

      // const normVector = normalizeVector(item.parsedVector);
      const similarity = getBestSimilarity(embedding, item.parsedVector);

      if (similarity > highestScore) {
        highestScore = similarity;
        matchedEmployee = item;
      }

      if (similarity >= duplicateThreshold) {
        return { highestScore, matchedEmployee };
      }
    }
  }

  return { highestScore, matchedEmployee };
};

// ────────────────────────────────────────────────
//  CONTINUOUS LEARNING (BACKGROUND UPDATE)
// ────────────────────────────────────────────────
export const improveFaceModelService = async ({
  db,
  staffId,
  uuid,
  newEmbedding,
  base64Image,
}) => {
  try {
    const { updateThreshold } = getFaceSettings();
    const existing = VECTOR_STORE.data.find(v => v.staffid === staffId);
    if (!existing) return;

    const similarity = getBestSimilarity(newEmbedding, existing.parsedVector);

    if (similarity < updateThreshold) {
      console.log(
        `[FACE LEARNING] Skipped update for ${staffId} (low similarity: ${similarity})`,
      );
      return;
    }

    // 1. Blend the average vector (90% old, 10% new for stability)
    const oldAvg =
      typeof existing.vector === 'string'
        ? JSON.parse(existing.vector)
        : existing.vector;
    const blendedAvg = blendAndNormalizeVectors(oldAvg, newEmbedding, 0.9);

    // 2. Append to the multi-vector array (Max 5 vectors)
    let vectors = Array.isArray(existing.parsedVector)
      ? [...existing.parsedVector]
      : [oldAvg];
    vectors.push(newEmbedding);
    if (vectors.length > 5) {
      vectors = vectors.slice(-5);
    }

    // 3. Save to local Database
    const currentUser = getCurrentUser();

    await addStaff(db, {
      uuid: existing.uuid,
      staffid: existing.staffid,
      name: existing.name,
      vector: JSON.stringify(blendedAvg),
      vectors: JSON.stringify(vectors),
      img: base64Image || '',
      enrollmode: 'offline',
      createdby: currentUser,
    });

    // 4. Queue for Cloud Sync
    await addFaceUpdate(db, {
      uuid: existing.uuid || uuid,
      staffid: staffId,
      vector: JSON.stringify(blendedAvg),
      vectors: JSON.stringify(vectors),
      img: base64Image || '',
      action: 'update',
    });

    // 5. Update In-Memory Cache immediately
    existing.vector = JSON.stringify(blendedAvg);
    existing.parsedVector = vectors;

    const newVersion = Date.now();
    await AsyncStorage.setItem(VECTOR_VERSION_KEY, String(newVersion));
    VECTOR_STORE.lastUpdated = newVersion;

    console.log(
      `[FACE LEARNING] Successfully improved vectors for Employee: ${staffId}`,
    );
  } catch (error) {
    console.error('[FACE LEARNING] Failed to improve model:', error);
  }
};
