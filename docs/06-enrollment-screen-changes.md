# 06 — Enrollment Screen Changes (`FaceEnrollmentScreen.js`)

The enrollment flow gets one new step: after the existing `updateFaceService` succeeds,
we also enroll the face in CompreFace. This is non-blocking — if cloud enrollment fails,
local enrollment still succeeds.

---

## Changes to `screens/FaceEnrollmentScreen.js`

### Step 1 — Add import

```javascript
// Add at the top with other imports:
import { cloudEnrollFace, isCloudRecognitionEnabled } from '../services/cloudFace.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
```

---

### Step 2 — Extend the finalize/save function

In `FaceEnrollmentScreen.js`, find the function that calls `updateFaceService` 
(typically called `handleSaveEnrollment`, `finalizeEnrollment`, or similar).

After the `updateFaceService` call succeeds, add the cloud enrollment block:

```javascript
// Your existing code (keep as-is):
const result = await updateFaceService({
  db,
  staffData,
  base64: referenceBase64,
  embedding: avgEmbedding,
  vectors: capturedVectors,
  cameraType: cameraPosition,
  skipDuplicationCheck: false,
});

if (result.status !== 'success') {
  // Handle error — existing code
  return;
}

// ─── NEW: Cloud Enrollment ─────────────────────────────────────
try {
  const cloudEnabled = await isCloudRecognitionEnabled();
  if (cloudEnabled) {
    const user = JSON.parse(await AsyncStorage.getItem('user'));
    const cloudResult = await cloudEnrollFace({
      empGuid: staffData.guid,
      imageBase64: referenceBase64,
      staffId: staffData.user.emp_id,
      name: staffData.name,
      userToken: user?.token,
    });

    if (cloudResult.success) {
      console.log('[ENROLLMENT] Cloud enrolled:', staffData.user.emp_id);
    } else {
      // Non-fatal — local enrollment succeeded, cloud will sync later
      console.warn('[ENROLLMENT] Cloud enroll skipped:', cloudResult.error);
    }
  }
} catch (cloudErr) {
  console.warn('[ENROLLMENT] Cloud enroll error (non-fatal):', cloudErr.message);
}
// ─── END Cloud Enrollment ──────────────────────────────────────

// Continue with your existing success handling...
onSuccess?.();
```

---

## Enrollment Flow After Changes

```
FaceEnrollmentScreen
  │
  ├── Capture face frames (existing — unchanged)
  ├── Quality validate each frame (existing — unchanged)
  ├── Extract TFLite embeddings (existing — unchanged)
  ├── Average embeddings (existing — unchanged)
  │
  ├── updateFaceService() ← LOCAL save (existing — unchanged)
  │     ├── Duplicate check
  │     ├── INSERT into facevector table
  │     └── Queue in facevector_updates (sync to server vectors)
  │
  └── cloudEnrollFace() ← CLOUD enroll (NEW — non-blocking)
        ├── POST /api/cloud/face/enroll → Node backend
        ├── Node proxies to CompreFace IndexFaces
        └── If fails: logged, local enrollment still complete
```

---

## Testing Enrollment

After making the changes, test this sequence:

1. Enable cloud recognition in Settings (toggle on)
2. Enroll a new employee
3. Check CompreFace Admin UI (`http://SERVER_IP:8080`)
4. Verify the employee's subject appears in the recognition service

```bash
# Verify via API
curl "http://localhost:8000/api/v1/recognition/faces?subject=EMP_GUID" \
  -H "x-api-key: YOUR_API_KEY"
```

Expected response:
```json
{
  "faces": [
    {
      "image_id": "abc123",
      "subject": "emp-guid-here"
    }
  ]
}
```
