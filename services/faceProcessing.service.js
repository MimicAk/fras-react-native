// services/faceProcessing.service.js

let stableFramesCount = 0;
let readyTimestamp = null;

/**
 * Resets the stabilization and capture lock mechanisms.
 * Call this when the camera unmounts or after a successful capture.
 */
export const resetFaceStabilizer = () => {
  stableFramesCount = 0;
  readyTimestamp = null;
};

/**
 * Forgiving, user-friendly face evaluation function.
 * Implements weighted scoring, eye-based alignment, multi-frame stability,
 * capture locking, and precise real-time directional feedback.
 * @param {Array} faces - Array of detected faces from ML Kit
 * @param {Object} imageSize - { width, height } of the current frame
 * @param {String} cameraType - 'front' or 'back' (to handle mirror logic)
 * @returns {Object} { isReady, canCapture, score, message, face }
 */
export const evaluateFaceQuality = (faces, imageSize, cameraType = 'front') => {
  // Relaxed stability constraints
  const REQUIRED_STABLE_FRAMES = 2;
  const CAPTURE_DELAY_MS = 150;
  const SCORE_THRESHOLD = 55;

  // ────────────────────────────────────────────────
  // 1️⃣ Single Face Enforcement
  // ────────────────────────────────────────────────
  if (!faces || faces.length === 0) {
    resetFaceStabilizer();
    return {
      isReady: false,
      canCapture: false,
      score: 0,
      message: 'No face detected. Please look at the camera.',
    };
  }

  const sortedFaces = [...faces].sort((a, b) => {
    const areaA = (a.frame?.width || 0) * (a.frame?.height || 0);
    const areaB = (b.frame?.width || 0) * (b.frame?.height || 0);
    return areaB - areaA;
  });

  if (sortedFaces.length > 1) {
    const primaryFace = sortedFaces[0];
    const secondaryFace = sortedFaces[1];

    const primaryArea = primaryFace.frame.width * primaryFace.frame.height;
    const secondaryArea =
      secondaryFace.frame.width * secondaryFace.frame.height;
    const secondaryConfidence = secondaryFace.confidence ?? 0;

    // Slightly more forgiving on background faces
    if (secondaryArea > primaryArea * 0.35 && secondaryConfidence > 0.5) {
      resetFaceStabilizer();
      return {
        isReady: false,
        canCapture: false,
        score: 0,
        message: 'Multiple faces detected. Ensure only one person is visible.',
      };
    }
  }

  const face = sortedFaces[0];
  const { width: imgW, height: imgH } = imageSize;
  let score = 0;
  const feedback = [];

  // ────────────────────────────────────────────────
  // 2️⃣ Confidence Check (Max 20 points)
  // ────────────────────────────────────────────────
  if (face.confidence !== undefined) {
    score += face.confidence * 20;
    if (face.confidence < 0.2) feedback.push('Move to a better lit area');
  } else {
    score += 20;
  }

  // ────────────────────────────────────────────────
  // 3️⃣ Head Rotation / Pose (Max 30 points)
  // ────────────────────────────────────────────────
  const yaw = face.yawAngle ?? 0; // Left/Right
  const pitch = face.pitchAngle ?? 0; // Up/Down
  const roll = face.rollAngle ?? 0; // Tilt

  const rotDeviation = Math.abs(yaw) + Math.abs(pitch) + Math.abs(roll);
  score += Math.max(0, 30 - rotDeviation * 0.5); // Less aggressive point deduction

  // Relaxed rotation angles
  if (Math.abs(yaw) > 20)
    feedback.push(yaw > 0 ? 'Turn slightly left' : 'Turn slightly right');
  if (Math.abs(pitch) > 20)
    feedback.push(pitch > 0 ? 'Look slightly down' : 'Look slightly up');
  if (Math.abs(roll) > 15) feedback.push('Keep your head straight');

  // ────────────────────────────────────────────────
  // 4️⃣ Advanced Eye-Based Alignment (Max 25 points)
  // ────────────────────────────────────────────────
  let faceCenterX, faceCenterY;

  // Prefer exact landmarks if available, fallback to bounding box logic
  const leftEye = face.landmarks?.leftEye?.position || face.leftEyePosition;
  const rightEye = face.landmarks?.rightEye?.position || face.rightEyePosition;

  if (leftEye && rightEye) {
    faceCenterX = (leftEye.x + rightEye.x) / 2;
    faceCenterY = (leftEye.y + rightEye.y) / 2;
  } else {
    faceCenterX = face.frame.left + face.frame.width / 2;
    faceCenterY = face.frame.top + face.frame.height / 2;
  }

  // Calculate offset relative to image center (-1.0 to 1.0)
  const hOffset = (faceCenterX - imgW / 2) / (imgW / 2);
  const vOffset = (faceCenterY - imgH / 2) / (imgH / 2);

  score += Math.max(0, 25 - (Math.abs(hOffset) + Math.abs(vOffset)) * 30); // Less aggressive point deduction

  const isFront = cameraType === 'front';

  // Wider bounding box for "center"
  if (hOffset > 0.25) {
    feedback.push(
      isFront
        ? 'Center your face (move device slightly left)'
        : 'Center your face (move device slightly right)',
    );
  } else if (hOffset < -0.25) {
    feedback.push(
      isFront
        ? 'Center your face (move device slightly right)'
        : 'Center your face (move device slightly left)',
    );
  }

  if (vOffset > 0.3) feedback.push('Center your face (move device up)');
  else if (vOffset < -0.3) feedback.push('Center your face (move device down)');

  // ────────────────────────────────────────────────
  // 5️⃣ Face Size Ratio (Max 15 points)
  // ────────────────────────────────────────────────
  const faceSizePx = Math.max(face.frame.width, face.frame.height);
  const minDimension = Math.min(imgW, imgH);
  const faceRatio = (faceSizePx / minDimension) * 100;

  // Broadened acceptable ratio sizes
  if (faceRatio >= 30 && faceRatio <= 85) {
    score += 15;
  } else {
    score += Math.max(0, 15 - Math.abs(55 - faceRatio) * 0.3);
  }

  if (faceRatio < 30) feedback.push('Move closer to the camera');
  else if (faceRatio > 85) feedback.push('Move slightly further away');

  // ────────────────────────────────────────────────
  // 6️⃣ Eye Openness (Max 10 points)
  // ────────────────────────────────────────────────
  const leftEyeOpen = face.leftEyeOpenProbability ?? 1;
  const rightEyeOpen = face.rightEyeOpenProbability ?? 1;
  score += ((leftEyeOpen + rightEyeOpen) / 2) * 10;

  // More forgiving on squinting/heavy eyelids
  if (leftEyeOpen < 0.4 || rightEyeOpen < 0.4)
    feedback.push('Keep both eyes fully open');

  // ────────────────────────────────────────────────
  // 7️⃣ Total Scoring & Stability/Lock Logic
  // ────────────────────────────────────────────────
  const totalScore = Math.min(100, Math.max(0, Math.round(score)));
  const meetsCriteria = totalScore >= SCORE_THRESHOLD && feedback.length === 0;

  if (meetsCriteria) {
    stableFramesCount++;

    // Stability Check: Require consecutive valid frames
    if (stableFramesCount >= REQUIRED_STABLE_FRAMES) {
      if (!readyTimestamp) readyTimestamp = Date.now();

      // Capture Lock Check: Enforce anti-flicker delay before finalizing
      if (Date.now() - readyTimestamp >= CAPTURE_DELAY_MS) {
        return {
          isReady: true,
          canCapture: true,
          score: totalScore,
          message: 'Perfect! Capturing...',
          face,
        };
      }
      return {
        isReady: true,
        canCapture: false,
        score: totalScore,
        message: 'Hold still...',
        face: null,
      };
    }
  } else {
    // Instability detected: Reset counters
    resetFaceStabilizer();
  }

  // Return the highest priority issue from the feedback array
  const currentMessage =
    feedback.length > 0 ? feedback[0] : 'Position your face in the frame';

  return {
    isReady: false,
    canCapture: false,
    score: totalScore,
    message: currentMessage,
    face: null,
  };
};
