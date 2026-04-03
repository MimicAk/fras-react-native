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
// ────────────────────────────────────────────────
//  CONFIGURATION
// ────────────────────────────────────────────────
const FACE_MATCH_THRESHOLD = 0.6;

const RECOGNITION_THRESHOLD = 0.55; //FOR DAILY CHECKIN & CHECKOUT
const ENROLLMENT_DUPLICATE_THRESHOLD = 0.75; // FOR DUPLICATE CHECKS
const TEMPLATE_UPDATE_THRESHOLD = 0.6; // DAILY SUCCESSFULL CHECKIN UPDATE
const BATCH_SIZE = 3500;

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
    .filter(item => item?.vector && item.vector !== 'null' && item.uuid)
    .map(item => {
      const parsedAvg = safeParse(item.vector);
      let parsedVectors = safeParse(item.vectors);

      if (!Array.isArray(parsedVectors)) parsedVectors = [];

      if (parsedVectors.length === 0 && parsedAvg.length === 512) {
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
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return [];
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

const getBestSimilarity = (query, vectors = []) => {
  if (!vectors.length) return 0;

  let best = 0;
  let second = 0;

  for (const v of vectors) {
    const sim = cosineSimilarity(query, v);

    if (sim > best) {
      second = best;
      best = sim;
    } else if (sim > second) {
      second = sim;
    }
  }

  // slight boost instead of reduction
  return best * 0.85 + second * 0.15;
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

    if (similarity >= RECOGNITION_THRESHOLD) {
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
  SEARCH_COUNT++;

  const useUserOnly = SEARCH_COUNT <= USER_ONLY_SEARCH_LIMIT;

  const vectors = useUserOnly ? VECTOR_STORE.userData : VECTOR_STORE.data;

  const matches = [];

  let bestScore = 0;
  let bestMatch = null;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const end = Math.min(i + BATCH_SIZE, vectors.length);

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
      if (
        similarity >= TEMPLATE_UPDATE_THRESHOLD &&
        similarity > FACE_MATCH_THRESHOLD
      ) {
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
      qualityPrioritization: 'speed',
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    const photo2 = await cameraRef.current.takePhoto({
      flash: 'off',
      qualityPrioritization: 'speed',
    });

    const filePath = photo.path.startsWith('file://')
      ? photo.path
      : `file://${photo.path}`;

    const filePath2 = photo2.path.startsWith('file://')
      ? photo2.path
      : `file://${photo2.path}`;

    // Get embedding
    const emb1 = await getFaceEmbeddingFromImage(
      filePath,
      switchCamera ? 'front' : 'back',
    );

    // small delay to stabilize sensor
    await new Promise(r => setTimeout(r, 60));

    const emb2 = await getFaceEmbeddingFromImage(
      filePath2,
      switchCamera ? 'front' : 'back',
    );

    if (
      !emb1 ||
      !emb2 ||
      typeof emb1 === 'string' ||
      typeof emb2 === 'string'
    ) {
      throw new Error('Face not detected properly');
    }

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
        embedding: embedding,
      };
    }

    return {
      status: 'multiple',
      matches,
      embedding: embedding,
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
  vectors: newVectors,
  cameraType: cameraPosition,
  skipDuplicationCheck = false,
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

    if (!skipDuplicationCheck) {
      const { highestScore, matchedEmployee } = await findDuplicateFace(
        avgEmbedding,
        VECTOR_STORE.data,
        staffData.user.emp_id,
      );

      console.log('Highest similarity:', highestScore);

      if (highestScore >= ENROLLMENT_DUPLICATE_THRESHOLD) {
        console.warn('Duplicate face detected');
        return {
          status: 'duplicate',
          message: `Face already registered for employee ${matchedEmployee?.staffid}`,
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
      const similarity = getBestSimilarity(embedding, item.parsedVector);

      if (similarity > highestScore) {
        highestScore = similarity;
        matchedEmployee = item;
      }

      if (similarity >= ENROLLMENT_DUPLICATE_THRESHOLD) {
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
    const existing = VECTOR_STORE.data.find(v => v.staffid === staffId);
    if (!existing) return;

    const similarity = getBestSimilarity(newEmbedding, existing.parsedVector);

    if (similarity < TEMPLATE_UPDATE_THRESHOLD) {
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
