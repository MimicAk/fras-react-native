// services/faceProcessing.service.js

import FaceDetection from '@react-native-ml-kit/face-detection';
import RNFS from 'react-native-fs';
import ImageEditor from '@react-native-community/image-editor';
import ImageResizer from 'react-native-image-resizer';
import { Image, Platform, NativeModules } from 'react-native';

const { TFLiteFaceModule } = NativeModules;

// ────────────────────────────────────────────────
//  QUALITY THRESHOLDS (tunable)
// ────────────────────────────────────────────────
const QUALITY_THRESHOLDS = {
  MIN_FACE_PERCENTAGE: 40, // % of image occupied by face
  MAX_HEAD_ROTATION_DEG: 15, // X/Y/Z rotation limit
  MIN_EYE_OPEN_PROB: 0.8, // Both eyes ≥ 80% open
  MIN_FACE_CONFIDENCE: 0.75, // ML Kit confidence
  CENTER_TOLERANCE_H: 0.25, // Horizontal offset from center
  CENTER_TOLERANCE_V: 0.35, // Vertical offset (more lenient)
  PADDING_PERCENT: 0.15, // Padding around detected face
  MIN_CROP_SIZE_PX: 80, // Minimum valid crop size
  EMBEDDING_TIMEOUT_MS: 8000, // Prevent hanging
};

// ────────────────────────────────────────────────
//  VALIDATE FACE QUALITY (throws descriptive errors)
// ────────────────────────────────────────────────
/**
 * Professional Face Quality Validator
 * Includes: Normalized coordinate checks, Euler angle thresholds,
 * and weighted probability scoring.
 */
export function validateFaceQuality(face, imageSize) {
  if (!face) {
    throw new Error('No face detected');
  }

  const { width: imgW, height: imgH } = imageSize;
  const errors = [];
  const f = face.frame;

  // ────────────────────────────────────────────────
  // 1️⃣ Confidence Check
  // ────────────────────────────────────────────────
  if ((face.confidence ?? 1) < QUALITY_THRESHOLDS.MIN_FACE_CONFIDENCE) {
    errors.push('Face detection confidence too low');
  }

  // ────────────────────────────────────────────────
  // 2️⃣ Head Rotation Check
  // ────────────────────────────────────────────────
  const maxRot = QUALITY_THRESHOLDS.MAX_HEAD_ROTATION_DEG || 15;

  if (Math.abs(face.yawAngle) > maxRot) {
    errors.push('Turn your head to face the camera');
  }

  if (Math.abs(face.pitchAngle) > maxRot) {
    errors.push('Keep your head level');
  }

  if (Math.abs(face.rollAngle) > maxRot + 5) {
    errors.push('Keep your head straight');
  }

  // ────────────────────────────────────────────────
  // 3️⃣ Eye Open Check
  // ────────────────────────────────────────────────
  const leftEye = face.leftEyeOpenProbability ?? 1;
  const rightEye = face.rightEyeOpenProbability ?? 1;
  const minEye = QUALITY_THRESHOLDS.MIN_EYE_OPEN_PROB || 0.4;

  if (leftEye < minEye || rightEye < minEye) {
    errors.push('Keep both eyes open');
  }

  // ────────────────────────────────────────────────
  // 4️⃣ Face Size Check
  // ────────────────────────────────────────────────
  const faceSizePx = Math.max(f.width, f.height);
  const minDimension = Math.min(imgW, imgH);
  const faceRatio = (faceSizePx / minDimension) * 100;

  if (faceRatio < QUALITY_THRESHOLDS.MIN_FACE_PERCENTAGE) {
    errors.push('Move closer to the camera');
  } else if (faceRatio > 85) {
    errors.push('Move slightly further away');
  }

  // ────────────────────────────────────────────────
  // 5️⃣ Centering Check
  // ────────────────────────────────────────────────
  const faceCenterX = f.left + f.width / 2;
  const faceCenterY = f.top + f.height / 2;

  const hOffset = (faceCenterX - imgW / 2) / (imgW / 2);
  const vOffset = (faceCenterY - imgH / 2) / (imgH / 2);

  const hTol = QUALITY_THRESHOLDS.CENTER_TOLERANCE_H || 0.35;
  const vTol = QUALITY_THRESHOLDS.CENTER_TOLERANCE_V || 0.5;

  if (Math.abs(hOffset) > hTol) {
    errors.push('Center your face horizontally');
  }

  if (Math.abs(vOffset) > vTol) {
    errors.push('Center your face vertically');
  }

  // ────────────────────────────────────────────────
  // 6️⃣ Final Validation Result
  // ────────────────────────────────────────────────
  if (errors.length > 0) {
    throw new Error(errors.slice(0, 2).join(' | '));
  }

  return true;
}

/**
 * Crops a face to a square, adds padding, and handles front-camera mirroring.
 */
async function cropFaceToSquare(imagePath, face, cameraType) {
  // 1. Get Image Dimensions
  const imageSize = await new Promise((resolve, reject) => {
    Image.getSize(
      imagePath,
      (w, h) => resolve({ width: w, height: h }),
      err => reject(new Error(`Failed to get image size: ${err.message}`)),
    );
  });

  // 2. Initial Face Coordinates
  let { left: x, top: y, width: w, height: h } = face.frame;

  // 3. Add Padding (from your QUALITY_THRESHOLDS)
  const padX = w * QUALITY_THRESHOLDS.PADDING_PERCENT;
  const padY = h * QUALITY_THRESHOLDS.PADDING_PERCENT;

  x -= padX;
  y -= padY;
  w += padX * 2;
  h += padY * 2;

  // 4. Calculate Square Dimensions
  let size = Math.max(w, h);
  let centerX = x + w / 2;
  let centerY = y + h / 2;

  // 5. Ensure the square stays within image bounds
  let squareX = centerX - size / 2;
  let squareY = centerY - size / 2;

  // Clamp to edges
  if (squareX < 0) squareX = 0;
  if (squareY < 0) squareY = 0;
  if (squareX + size > imageSize.width) squareX = imageSize.width - size;
  if (squareY + size > imageSize.height) squareY = imageSize.height - size;

  // Final fallback: if size is still larger than image, shrink it
  const finalSize = Math.min(size, imageSize.width, imageSize.height);

  if (finalSize < QUALITY_THRESHOLDS.MIN_CROP_SIZE_PX) {
    throw new Error('Cropped face too small');
  }

  const cropConfig = {
    offset: { x: Math.floor(squareX), y: Math.floor(squareY) },
    size: { width: Math.floor(finalSize), height: Math.floor(finalSize) },
    displaySize: { width: 160, height: 160 },
    resizeMode: 'contain',
  };

  // 6. Handle Front Camera Mirroring
  if (cameraType === 'front' || cameraType === 'user') {
    cropConfig.transform = [{ scaleX: -1 }];
  }

  let croppedUri;
  try {
    // Attempt the precise crop
    const result = await ImageEditor.cropImage(imagePath, cropConfig);
    // Handle different return types (string vs object)
    croppedUri = typeof result === 'object' ? result.uri : result;
  } catch (err) {
    console.warn('Precise crop failed, using fallback resizer:', err);
    // Fallback to basic center-crop resize
    const resized = await ImageResizer.createResizedImage(
      imagePath,
      160,
      160,
      'JPEG',
      90,
      0,
      undefined,
      false,
      { mode: 'cover' },
    );
    croppedUri = resized.uri; // Extract string from object
  }

  // 7. Safe string manipulation
  if (!croppedUri) {
    throw new Error('Image URI is undefined after processing');
  }

  return croppedUri.replace('file://', '');
}

// ────────────────────────────────────────────────
//  MAIN: Get high-quality face embedding (uses raw path)
// ────────────────────────────────────────────────
export const getFaceEmbeddingFromImage = async (
  imagePath,
  cameraType = 'unknown',
  enableValidation = true,
) => {
  try {
    // 1. Detect faces (accurate mode)
    const faces = await FaceDetection.detect(imagePath, {
      performanceMode: 'accurate',
      landmarkMode: 'all',
      classificationMode: 'all',
      minFaceSize: 0.2,
      contourMode: 'all',
      trackingEnabled: false,
    });

    const face = selectValidFace(faces);

    // 2. Get image dimensions
    const imageSize = await new Promise((resolve, reject) => {
      Image.getSize(
        imagePath,
        (w, h) => resolve({ width: w, height: h }),
        reject,
      );
    });

    // 3. Validate quality
    if (enableValidation) {
      validateFaceQuality(face, imageSize);
    }

    // 4. Crop to clean square face
    const croppedPath = await cropFaceToSquare(imagePath, face, cameraType);

    // 5. Timeout-protected native embedding call
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Face embedding timeout')),
        QUALITY_THRESHOLDS.EMBEDDING_TIMEOUT_MS,
      ),
    );

    const nativePromise =
      Platform.OS === 'android'
        ? TFLiteFaceModule.getFaceEmbeddingWithCamera(croppedPath, cameraType)
        : Promise.reject(new Error('iOS embedding module not implemented'));

    const result = await Promise.race([nativePromise, timeoutPromise]);

    if (!result?.embedding || !Array.isArray(result.embedding)) {
      throw new Error('Invalid embedding returned from native module');
    }

    const embedding = new Float32Array(result.embedding);

    // 6. Cleanup temp cropped file
    try {
      await RNFS.unlink(croppedPath);
    } catch {}

    return embedding;
  } catch (error) {
    throw new Error(`Face processing failed: ${error.message}`);
  }
};

/**
 * Selects the most valid face from an array of detected faces based on confidence and size.
 * Throws errors if no faces are detected, confidence is too low, or multiple real faces are present.
 *
 * @param {Array<Object>} detectedFaces - Array of detected face objects, each containing at least `confidence` and `frame` properties.
 * @returns {Object} The most valid detected face object.
 * @throws {Error} If no faces are detected.
 * @throws {Error} If all detected faces have confidence below the threshold.
 * @throws {Error} If multiple real faces are detected (second largest face is more than 35% the size of the largest).
 */
export const selectValidFace = detectedFaces => {
  if (!detectedFaces || detectedFaces.length === 0) {
    throw new Error(
      'No face detected. Position your face clearly in the frame.',
    );
  }

  // 1️⃣ Remove low confidence detections
  const validFaces = detectedFaces.filter(
    f => (f.confidence ?? 1) >= QUALITY_THRESHOLDS.MIN_FACE_CONFIDENCE,
  );

  if (validFaces.length === 0) {
    throw new Error('Face detection confidence too low.');
  }

  // 2️⃣ Sort by face size (largest first)
  const sortedFaces = validFaces.sort((a, b) => {
    const sizeA = a.frame.width * a.frame.height;
    const sizeB = b.frame.width * b.frame.height;
    return sizeB - sizeA;
  });

  const face = sortedFaces[0];

  // 3️⃣ Detect real multiple faces
  if (sortedFaces.length > 1) {
    const biggest = sortedFaces[0].frame.width * sortedFaces[0].frame.height;
    const second = sortedFaces[1].frame.width * sortedFaces[1].frame.height;

    if (second > biggest * 0.35) {
      throw new Error(
        'Multiple faces detected. Ensure only one person is visible.',
      );
    }
  }

  return face;
};

// ────────────────────────────────────────────────
//  COMPRESS BASE64 IMAGE (fallback utility)
// ────────────────────────────────────────────────
export const compressBase64Image = async (
  base64Image,
  quality = 60,
  format = 'JPEG',
) => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

    const tempPath = `${
      RNFS.TemporaryDirectoryPath
    }/temp_input_${Date.now()}.${format.toLowerCase()}`;
    await RNFS.writeFile(tempPath, cleanBase64, 'base64');

    const resized = await ImageResizer.createResizedImage(
      tempPath,
      1024,
      1024,
      format,
      quality,
      0,
      undefined,
      false,
      { mode: 'contain' },
    );

    const compressedBase64 = await RNFS.readFile(
      resized.uri.replace('file://', ''),
      'base64',
    );

    // Cleanup
    await Promise.all([
      RNFS.unlink(tempPath).catch(() => {}),
      RNFS.unlink(resized.uri.replace('file://', '')).catch(() => {}),
    ]);

    return compressedBase64;
  } catch (err) {
    throw new Error(`Image compression failed: ${err.message}`);
  }
};

// ────────────────────────────────────────────────
//  REAL-TIME FACE QUALITY CHECK FOR PREVIEW
// ────────────────────────────────────────────────
export const checkFaceQualityRealTime = async imagePath => {
  try {
    const faces = await FaceDetection.detect(imagePath, {
      performanceMode: 'fast',
      landmarkMode: 'all',
      classificationMode: 'all',
      minFaceSize: 0.1,
    });

    if (faces.length === 0) {
      return { isReady: false, message: 'No face detected' };
    }

    if (faces.length > 1) {
      return { isReady: false, message: 'Multiple faces detected' };
    }

    const face = faces[0];
    const imageSize = await new Promise((resolve, reject) =>
      Image.getSize(
        imagePath,
        (w, h) => resolve({ width: w, height: h }),
        reject,
      ),
    );

    const faceArea = face.frame.width * face.frame.height;
    const imageArea = imageSize.width * imageSize.height;
    const percentage = (faceArea / imageArea) * 100;

    if (percentage < 30) {
      return { isReady: false, message: 'Come closer to the camera' };
    }

    if (
      Math.abs(face.rotationX) > 20 ||
      Math.abs(face.rotationY) > 20 ||
      Math.abs(face.rotationZ) > 20
    ) {
      return { isReady: false, message: 'Keep your head straight' };
    }

    if (
      face.leftEyeOpenProbability < 0.7 ||
      face.rightEyeOpenProbability < 0.7
    ) {
      return { isReady: false, message: 'Open your eyes fully' };
    }

    return { isReady: true, message: 'Ready to capture' };
  } catch (err) {
    return { isReady: false, message: 'Checking face quality...' };
  }
};