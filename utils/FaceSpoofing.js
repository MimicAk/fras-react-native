import { NativeModules, Platform } from 'react-native';

const { FaceSpoofDetector } = NativeModules;

if (!FaceSpoofDetector) {
  console.warn('FaceSpoofDetector native module not found. Is it linked correctly?');
}

/**
 * @typedef {object} FaceSpoofResult
 * @property {boolean} isSpoof - True if the face is detected as a spoof, false otherwise.
 * @property {number} score - The confidence score of the spoof detection.
 * @property {number} timeMillis - The time taken for detection in milliseconds.
 */

/**
 * @typedef {object} FaceRect
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 */

class FaceSpoofDetectorModule {
  /**
   * Initializes the FaceSpoofDetector models.
   * This should be called once before performing any detection.
   * @returns {Promise<boolean>} Resolves to true if initialization is successful.
   */
  async initialize() {
    if (Platform.OS === 'android' && FaceSpoofDetector) {
      return FaceSpoofDetector.initialize();
    }
    return Promise.resolve(false); // Not supported or not initialized on other platforms
  }

  /**
   * Detects if a face in an image is a spoof.
   * @param {string} imageUri - The URI of the image (e.g., 'file:///...', 'data:image/jpeg;base64,...').
   * @param {FaceRect} faceRect - The bounding box of the face in the image.
   * @returns {Promise<FaceSpoofResult>} Resolves with the spoof detection result.
   */
  async detectSpoof(imageUri, face) {

    console.log("detectSpoof",face?.frame,0)
    if (Platform.OS === 'android' && FaceSpoofDetector) {
      const x = face.frame.left;
      const y = face.frame.top;
      const width = face.frame.width;
      const height = face.frame.height;

      return FaceSpoofDetector.detectSpoof(imageUri,x,y,height,width);
    }
    return Promise.reject(new Error('FaceSpoofDetector is only available on Android.'));
  }
}

export default new FaceSpoofDetectorModule();