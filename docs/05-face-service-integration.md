# 05 — Integrating Cloud into `face.service.js`

These are the **exact changes** to make to your existing `services/face.service.js`.
The local pipeline is preserved completely — cloud sits above it as a fast lane.

---

## 1. Add imports at the top (after existing imports)

```javascript
// Add after existing imports in face.service.js
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import {
  cloudRecognizeFace,
  checkLiveness,
  isCloudRecognitionEnabled,
  filePathToBase64,
} from './cloudFace.service';
```

---

## 2. Replace `recognizeFaceService` (full function)

The new version tries cloud first, then falls through to the existing `oldLinearSearch` logic.
The local embedding extraction only runs if cloud fails or is offline — saving the expensive TFLite step.

**Find this line in `face.service.js`:**
```javascript
export const recognizeFaceService = async ({ cameraRef, switchCamera }) => {
```

**Replace the entire function with:**

```javascript
export const recognizeFaceService = async ({ cameraRef, switchCamera, userToken }) => {
  try {
    if (!cameraRef?.current) {
      throw new Error('Camera not ready');
    }

    if (VECTOR_STORE.data.length === 0) {
      throw new Error('No enrolled faces available');
    }

    const { captureCount } = getFaceSettings();

    // ─── 1. CAPTURE PHASE (unchanged) ─────────────────────────
    const photos = [];
    for (let i = 0; i < captureCount; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 150));
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'speed',
      });
      photos.push(photo);
    }

    // ─── 2. CLOUD PATH (new) ──────────────────────────────────
    const cloudEnabled = await isCloudRecognitionEnabled();
    const netState = await NetInfo.fetch();
    const isOnline = netState.isConnected && netState.isInternetReachable;

    if (cloudEnabled && isOnline) {
      // Use first photo for cloud (CompreFace handles its own quality check)
      const firstPath = photos[0].path.startsWith('file://')
        ? photos[0].path
        : `file://${photos[0].path}`;

      try {
        const imageBase64 = await filePathToBase64(firstPath);

        // Optional liveness check (first daily punch)
        let livenessScore = null;
        const livenessResult = await checkLiveness({ imageBase64, userToken });
        if (livenessResult.isReal === false) {
          return {
            status: 'liveness_failed',
            message: 'Liveness check failed — please look directly at the camera',
            livenessConfidence: livenessResult.confidence,
          };
        }
        livenessScore = livenessResult.confidence;

        // Cloud recognition
        const cloudResult = await cloudRecognizeFace({ imageBase64, userToken });

        if (cloudResult.status === 'match') {
          // Find full employee data from local VECTOR_STORE using empGuid
          const localEmployee = VECTOR_STORE.data.find(
            v => v.uuid === cloudResult.empGuid
          );

          if (localEmployee) {
            return {
              status: 'single',
              employee: {
                uuid: localEmployee.uuid,
                name: localEmployee.name,
                staffid: localEmployee.staffid,
                img: localEmployee.img,
                similarity: cloudResult.similarity,
              },
              recognition_source: 'cloud',
              confidence_score: cloudResult.similarityPercent,
              liveness_score: livenessScore,
              // No local embedding returned — cloud path skips TFLite
            };
          }
        }

        // Cloud returned no match — fall through to local
        console.log('[FACE] Cloud: no match, falling through to local pipeline');

      } catch (cloudError) {
        // Non-fatal — fall through to local
        console.log('[FACE] Cloud recognition error (using local):', cloudError.message);
      }
    }

    // ─── 3. LOCAL PATH (existing, unchanged) ─────────────────
    const embeddings = [];
    for (let i = 0; i < photos.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 60));

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

    let rawEmbedding = embeddings[0];
    if (embeddings.length > 1) {
      rawEmbedding = rawEmbedding.map((val, idx) => {
        let sum = val;
        for (let j = 1; j < embeddings.length; j++) sum += embeddings[j][idx];
        return sum / embeddings.length;
      });
    }

    const embedding = normalizeVector(rawEmbedding);

    if (!embedding || typeof embedding === 'string') {
      throw new Error('No valid face detected in capture');
    }

    const { matches, bestScore } = await findMatchesInBatches(embedding);

    if (matches.length === 0) {
      return {
        status: 'no_match',
        message: `Face not recognized (${(bestScore * 100).toFixed(1)}% match)`,
        recognition_source: 'local',
      };
    }

    if (matches.length === 1) {
      return {
        status: 'single',
        employee: matches[0],
        embedding: embedding,
        recognition_source: 'local',
        confidence_score: parseFloat((matches[0].similarity * 100).toFixed(1)),
      };
    }

    return {
      status: 'multiple',
      matches,
      embedding: embedding,
      recognition_source: 'local',
    };

  } catch (error) {
    return {
      status: 'error',
      message: error.message || 'Recognition failed',
    };
  }
};
```

---

## 3. Update `improveFaceModelService` — Skip update on cloud matches

Find this line inside `improveFaceModelService`:
```javascript
export const improveFaceModelService = async ({
  db, staffId, uuid, newEmbedding, base64Image,
}) => {
```

Add a `recognition_source` parameter and guard at the top:

```javascript
export const improveFaceModelService = async ({
  db, staffId, uuid, newEmbedding, base64Image,
  recognition_source = 'local',  // ADD THIS PARAM
}) => {
  // Don't drift local model when cloud handled recognition
  if (recognition_source === 'cloud') return;

  // ... rest of the function unchanged
```

---

## 4. Update `updateFaceService` — Also enroll in cloud after local save

At the end of `updateFaceService`, **after** the `addFaceUpdate` call, add the cloud enrollment:

```javascript
// At the bottom of updateFaceService, after:
//   await addFaceUpdate(db, { ... });
// Add:

try {
  const cloudEnabled = await isCloudRecognitionEnabled();
  if (cloudEnabled && referenceBase64) {
    const { cloudEnrollFace } = require('./cloudFace.service');
    const token = await AsyncStorage.getItem('userToken'); // or pass via param
    const cloudResult = await cloudEnrollFace({
      empGuid: staffData.guid,
      imageBase64: referenceBase64,
      staffId: staffData.user.emp_id,
      name: staffData.name,
      userToken: token,
    });
    if (!cloudResult.success) {
      console.warn('[CLOUD ENROLL] Non-fatal:', cloudResult.error);
    }
  }
} catch (cloudErr) {
  console.warn('[CLOUD ENROLL] Non-fatal error:', cloudErr.message);
}
```

---

## 5. How `checkin.js` uses the new result

Your `checkin.js` already uses `recognizeFaceService` and reads `result.employee`, `result.status`, etc.
You need to **pass `userToken`** and **pass `recognition_source` + `confidence_score` to `recordPunch`**.

In `checkin.js`, find where you call `recognizeFaceService`:

```javascript
// Before (in checkin.js):
const result = await recognizeFaceService({ cameraRef, switchCamera });

// After:
const user = JSON.parse(await AsyncStorage.getItem('user'));
const result = await recognizeFaceService({
  cameraRef,
  switchCamera,
  userToken: user?.token,
});
```

And where you call `recordPunch` (or `processCheckInService`), pass the new fields:

```javascript
await recordPunch(db, {
  // ... existing fields ...
  recognition_source: result.recognition_source || 'local',
  confidence_score: result.confidence_score || null,
  liveness_score: result.liveness_score || null,
});
```

---

## 6. Enable Cloud Recognition in Settings

Add to `utils/settings.helper.js`:

```javascript
// In SETTINGS_CONFIG object, add:
CLOUD_RECOGNITION_ENABLED: {
  key: 'CLOUD_RECOGNITION_ENABLED',
  default: 'false',
  label: 'Cloud Face Recognition',
  type: 'toggle',
},
```

Add to `screens/SettingsScreen.js` a toggle switch:

```javascript
import { isCloudRecognitionEnabled, setCloudRecognitionEnabled } from '../services/cloudFace.service';

// In your settings state initialization:
const [cloudEnabled, setCloudEnabled] = useState(false);

useEffect(() => {
  isCloudRecognitionEnabled().then(setCloudEnabled);
}, []);

// In render:
<View style={styles.row}>
  <Text>Cloud Recognition (CompreFace)</Text>
  <Switch
    value={cloudEnabled}
    onValueChange={async (val) => {
      await setCloudRecognitionEnabled(val);
      setCloudEnabled(val);
    }}
  />
</View>
```
