// utils/hnswIndex.js

/**
 * High performance HNSW index manager
 * Optimized for React Native event loop using pure JS 'hnsw'
 */

import { HNSW } from 'hnsw';

const CONFIG = {
  DIMENSION: 512,
  M: 16,
  EF_CONSTRUCTION: 200,
  EF_SEARCH: 64,
  BUILD_CHUNK: 5,
};

class HNSWIndexManager {
  constructor() {
    this.index = null;
    this.elementCount = 0;
    this.currentVersion = null;

    this.isBuilding = false;
    this.buildPromise = null;
  }

  async yieldThread() {
    return new Promise(r => setTimeout(r, 0));
  }

  clearIndex() {
    this.index = null;
    this.elementCount = 0;
    this.currentVersion = null;
  }

  hasIndex() {
    return this.index !== null;
  }

  isIndexBuilding() {
    return this.isBuilding;
  }

  async buildIndex(data, version) {
    if (!data || data.length === 0) {
      this.clearIndex();
      return false;
    }

    if (this.isBuilding && this.buildPromise) {
      return this.buildPromise;
    }

    this.isBuilding = true;

    this.buildPromise = (async () => {
      try {
        console.log('[HNSW] Building index...');

        // 1. Correct Pure JS Initialization
        const index = new HNSW(
          CONFIG.M,
          CONFIG.EF_CONSTRUCTION,
          CONFIG.DIMENSION,
          'cosine',
          CONFIG.EF_SEARCH,
        );

        let added = 0;

        // 2. Build in chunks to yield the thread
        for (let i = 0; i < data.length; i += CONFIG.BUILD_CHUNK) {
          const end = Math.min(i + CONFIG.BUILD_CHUNK, data.length);
          const chunkData = [];

          for (let j = i; j < end; j++) {
            const item = data[j];
            let vec = item?.parsedVector;

            if (!vec) continue;

            if (!Array.isArray(vec) && !(vec instanceof Float32Array)) {
              vec = Object.values(vec);
            }

            if (vec.length !== CONFIG.DIMENSION) continue;

            // The pure JS hnsw package works best with standard Arrays
            chunkData.push({ id: j, vector: Array.from(vec) });
            added++;
          }

          // Add the chunk to the index
          if (chunkData.length > 0) {
            index.buildIndex(chunkData);
          }

          await this.yieldThread();
        }

        this.index = index;
        this.elementCount = added;
        this.currentVersion = version;

        console.log(`[HNSW] Indexed ${added} vectors natively in JS`);

        return true;
      } catch (err) {
        console.error('[HNSW] Build failed', err);
        this.clearIndex();
        throw err;
      } finally {
        this.isBuilding = false;
        this.buildPromise = null;
      }
    })();

    return this.buildPromise;
  }

  async ensureIndex(data, version) {
    if (!this.index || this.currentVersion !== version) {
      await this.buildIndex(data, version);
    }
  }

  addSinglePoint(id, vector) {
    try {
      if (!this.index) return;

      const vec = Array.from(vector);
      if (vec.length !== CONFIG.DIMENSION) return;

      // Pure JS 'hnsw' uses buildIndex to add points incrementally
      this.index.buildIndex([{ id, vector: vec }]);
      this.elementCount++;
    } catch (err) {
      console.error('[HNSW] addSinglePoint failed', err);
    }
  }

  async search(queryEmbedding, k = 10) {
    if (!this.index || this.elementCount === 0) {
      return { neighbors: [], distances: [] };
    }

    try {
      const query = Array.from(queryEmbedding);

      if (query.length !== CONFIG.DIMENSION) {
        throw new Error('Query dimension mismatch');
      }

      const safeK = Math.min(k, this.elementCount);

      // 3. Correct Pure JS Search Method
      const result = this.index.searchKNN(query, safeK);

      if (!result || result.length === 0) {
        return { neighbors: [], distances: [] };
      }

      const neighbors = [];
      const similarities = [];

      for (const r of result) {
        neighbors.push(r.id);

        // Pure JS 'hnsw' returns Cosine Similarity directly as "score"
        // No need to subtract from 1!
        similarities.push(r.score);
      }

      return {
        neighbors,
        distances: similarities,
      };
    } catch (err) {
      console.error('[HNSW] search failed', err);
      return { neighbors: [], distances: [] };
    }
  }
}

export const faceIndexManager = new HNSWIndexManager();
