// utils/hnswIndex.js

import { HNSW } from 'hnsw';
import { VECTOR_STORE } from '../services/face.service';

let hnswIndex = null;
let indexVersion = 0;
const DIMENSION = 512; // Standardize this for your model

export const buildHNSWIndex = async () => {
  if (!VECTOR_STORE.data || VECTOR_STORE.data.length === 0) {
    hnswIndex = null;
    return;
  }

  console.time('[HNSW] Build');

  // M: max connections, efConstruction: search accuracy during build
  // 'cosine' is often handled as Inner Product on normalized vectors
  hnswIndex = new HNSW(16, 200, DIMENSION, 'cosine', 100);

  const chunkSize = 200;
  for (let i = 0; i < VECTOR_STORE.data.length; i += chunkSize) {
    const chunk = VECTOR_STORE.data.slice(i, i + chunkSize);

    for (const item of chunk) {
      if (item.parsedVector && item.parsedVector.length === DIMENSION) {
        // Ensure Float32Array for performance
        const vec = Float32Array.from(item.parsedVector);
        hnswIndex.addPoint(vec, i + chunk.indexOf(item));
      }
    }
    // Yield to keep UI responsive
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  indexVersion = VECTOR_STORE.lastUpdated?.getTime() || Date.now();
  console.timeEnd('[HNSW] Build');
};

export const ensureHNSWIndex = async version => {
  // Only rebuild if the index is missing or the data version has changed
  if (!hnswIndex || indexVersion !== version) {
    console.log('[HNSW] Index outdated/missing. Rebuilding...');
    await buildHNSWIndex();
  }
};

export const hasIndex = () => {
  return hnswIndex !== null;
};

export const hnswSearch = async (queryEmbedding, k = 10) => {
  if (!hnswIndex) return { neighbors: [], distances: [] };

  try {
    // Ensure query is the right dimension and type
    const query = Float32Array.from(queryEmbedding);
    if (query.length !== DIMENSION) {
      throw new Error(
        `Query dimension mismatch: ${query.length} vs ${DIMENSION}`,
      );
    }

    const results = await hnswIndex.searchKNN(query, k, { efSearch: 128 });

    return {
      neighbors: results.map(r => r.id),
      distances: results.map(r => r.score),
    };
  } catch (error) {
    console.error('[HNSW] Search failed:', error);
    return { neighbors: [], distances: [] };
  }
};
