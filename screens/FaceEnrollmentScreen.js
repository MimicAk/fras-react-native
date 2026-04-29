// screens/FaceEnrollmentScreen.js
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';

import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import RNFS from 'react-native-fs';

import { getSetting } from '../utils/settings.helper';
import { resetFaceStabilizer } from '../services/faceProcessing.service';

const { width, height } = Dimensions.get('window');

const SwitchIcon = () => (
  <View style={styles.iconContainer}>
    {/* Top Curved Arrow */}
    <View style={styles.curveTop} />
    <View style={[styles.arrowHead, styles.arrowHeadTop]} />

    {/* Bottom Curved Arrow */}
    <View style={styles.curveBottom} />
    <View style={[styles.arrowHead, styles.arrowHeadBottom]} />
  </View>
);

import FacePositionOverlay from '../components/FacePositionOverlay';
import {
  // getFaceEmbeddingFromImage, // disabled: local embeddings off
  checkFaceQualityRealTime,
} from '../utils/FaceRecognitionUtil';

import { updateFaceService } from '../services/face.service';
import { connectToDatabase } from '../database/connection';

import Logger from '../services/bugfender.service';
import { cfEnrollFace, cfRefreshStaffCache } from '../services/compreFace.service';

export default function FaceEnrollmentScreen({ navigation, route }) {
  const { staffData, onEnrollmentSuccess } = route?.params || {};
  const isFocused = useIsFocused();

  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState('front');
  const device = useCameraDevice(cameraPosition);

  const cameraRef = useRef(null);
  const isProcessing = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedBase64s, setCapturedBase64s] = useState([]);
  const [statusText, setStatusText] = useState('Position face in oval');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isCaptureEnabled, setIsCaptureEnabled] = useState(false);

  // LOCAL EMBEDDING STATE — disabled
  // const [embeddings, setEmbeddings] = useState([]);
  // const [referenceBase64, setReferenceBase64] = useState(null);

  // ────────────────────────────────────────────────
  //  DYNAMIC ENROLLMENT STEPS
  // ────────────────────────────────────────────────
  const captureCount = getSetting('ENROLLMENT_CAPTURE_COUNT') || 3;

  const CAPTURE_STEPS = useMemo(() => {
    if (captureCount === 5) {
      return [
        { id: 1, title: 'Neutral Expression', desc: 'Look straight at the camera.' },
        { id: 2, title: 'Slight Smile', desc: 'Give a small, natural smile.' },
        { id: 3, title: 'Look Left', desc: 'Turn your head slightly to the left.' },
        { id: 4, title: 'Look Right', desc: 'Turn your head slightly to the right.' },
        { id: 5, title: 'Look Up', desc: 'Tilt your head slightly upward.' },
      ];
    }
    // Default to 3 snaps
    return [
      { id: 1, title: 'Neutral Expression', desc: 'Look straight at the camera.' },
      { id: 2, title: 'Slight Smile', desc: 'Give a small, natural smile.' },
      { id: 5, title: 'Look Up', desc: 'Tilt your head slightly upward.' },
    ];
  }, [captureCount]);

  useEffect(() => {
    if (hasPermission === false) {
      (async () => {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert('Permission Required', 'Face enrollment needs camera access.');
        }
      })();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    Logger.info(`FaceEnrollmentScreen mounted for staff: ${staffData?.guid || 'UNKNOWN'}`);

    if (!staffData?.guid) {
      Logger.warn('Enrollment aborted: Missing employee information (staffData.guid is null)');
      Alert.alert('Error', 'Missing employee information', [
        { text: 'Go Back', onPress: () => navigation.goBack() },
      ]);
    }
  }, [staffData, navigation]);

  const updateQualityFeedback = useCallback(async () => {
    if (!cameraRef.current || !isFocused || isCapturing || isFinalizing || !device || !cameraReady)
      return;
    let snapshotPath = null;
    try {
      const snap = await cameraRef.current.takeSnapshot({ quality: 80, skipMetadata: true });
      snapshotPath = `file://${snap.path}`;
      const result = await checkFaceQualityRealTime(snapshotPath, cameraPosition);
      setStatusText(result.message);
      setIsCaptureEnabled(result.canCapture);
    } catch (err) {
      Logger.trace(`Quality check failed: ${err?.message}`);
    } finally {
      if (snapshotPath) RNFS.unlink(snapshotPath).catch(() => {});
    }
  }, [isFocused, device, cameraReady, isCapturing, isFinalizing]);

  useEffect(() => {
    if (hasPermission !== true || !device || !cameraReady) return;
    const interval = setInterval(updateQualityFeedback, 800);
    return () => clearInterval(interval);
  }, [hasPermission, device, cameraReady, updateQualityFeedback]);

  // ─── CF-ONLY CAPTURE FLOW ─────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isProcessing.current || !cameraReady) return;

    Logger.info(`Initiating capture for step ${currentStep + 1} (${CAPTURE_STEPS[currentStep]?.title})`);

    isProcessing.current = true;
    setIsCapturing(true);
    setStatusText('Capturing...');

    let photoPath = null;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'balanced',
        skipMetadata: true,
      });
      photoPath = `file://${photo.path}`;

      const base64 = await RNFS.readFile(photoPath, 'base64');
      const newBase64s = [...capturedBase64s, base64];
      setCapturedBase64s(newBase64s);

      if (currentStep < CAPTURE_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
        setStatusText('Good! Next position...');
      } else {
        setIsFinalizing(true);
        setStatusText('Enrolling...');
        await cfFinalizeEnrollment(newBase64s);
      }
    } catch (error) {
      Logger.error(`Capture failed at step ${currentStep + 1}: ${error?.message}`);
      Alert.alert('Capture Failed', error?.message || 'Try again.');
    } finally {
      setIsCapturing(false);
      isProcessing.current = false;
      resetFaceStabilizer();
      if (photoPath) RNFS.unlink(photoPath).catch(() => {});
    }
  }, [cameraReady, currentStep, capturedBase64s, cameraPosition, staffData, navigation]);

  const cfFinalizeEnrollment = async allBase64s => {
    try {
      setIsFinalizing(true);
      setStatusText('Enrolling face...');
      Logger.info(`CF enrollment: uploading ${allBase64s.length} images for ${staffData?.guid}`);

      const results = await Promise.all(
        allBase64s.map(b64 => cfEnrollFace({ base64: b64, empGuid: staffData.guid })),
      );

      const succeeded = results.filter(r => r.success).length;
      Logger.info(`CF enrollment done: ${succeeded}/${allBase64s.length} images uploaded`);

      if (succeeded === 0) {
        Alert.alert(
          'Enrollment Failed',
          'Could not upload face to the recognition service. Check your connection and try again.',
        );
        setCurrentStep(0);
        setCapturedBase64s([]);
        setStatusText('Position face in oval');
        return;
      }

      // Save staff record locally with empty embeddings — CF handles recognition
      const db = await connectToDatabase();
      await updateFaceService({
        db,
        staffData,
        base64: allBase64s[0],
        embedding: [],
        vectors: [],
        cameraType: cameraPosition,
        skipDuplicationCheck: true,
      });

      cfRefreshStaffCache();
      onEnrollmentSuccess?.();
      navigation.goBack();
    } catch (err) {
      Logger.error(`CF enrollment error: ${err?.message}`);
      Alert.alert('System Error', err?.message || 'Enrollment failed unexpectedly.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // ─── LOCAL EMBEDDING FLOW — disabled ──────────────────────────
  /*
  const finalizeEnrollment = async (finalEmbeddings, forceSave = false, allBase64s = []) => {
    try {
      setIsFinalizing(true);
      setStatusText(forceSave ? 'Saving Face...' : 'Checking duplicates...');

      const validEmbeddings = finalEmbeddings.filter(
        e => (Array.isArray(e) || e instanceof Float32Array) && e.length === 512,
      );

      if (validEmbeddings.length === 0) {
        Alert.alert('Face Error', 'No valid face embeddings captured.');
        setIsFinalizing(false);
        return;
      }

      const avgEmbedding = computeAverageAndNormalize(validEmbeddings);
      const vectors = validEmbeddings.map(v => normalizeVector(v));
      const db = await connectToDatabase();

      const result = await updateFaceService({
        db,
        staffData,
        base64: referenceBase64,
        embedding: avgEmbedding,
        vectors: vectors,
        cameraType: cameraPosition,
        skipDuplicationCheck: forceSave,
      });

      if (result?.status === 'success') {
        // cloud enroll was here
        onEnrollmentSuccess?.();
        navigation.goBack();
        return;
      }

      if (result?.status === 'duplicate' && !forceSave) {
        setIsFinalizing(false);
        setStatusText('Duplicate Found');
        Alert.alert(
          'Duplicate Face Detected',
          result.message || 'This face matches an existing employee.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setCurrentStep(0);
                setEmbeddings([]);
                setReferenceBase64(null);
                setCapturedBase64s([]);
                setStatusText('Position face in oval');
              },
            },
            {
              text: 'Continue',
              style: 'destructive',
              onPress: () => finalizeEnrollment(finalEmbeddings, true, allBase64s),
            },
          ],
          { cancelable: false },
        );
        return;
      }

      if (result?.status === 'duplicate' && forceSave) {
        Alert.alert('Duplicate Face', result.message);
      } else if (result?.status === 'error') {
        Alert.alert('Enrollment Error', result.message);
      } else {
        Alert.alert('Enrollment Failed', 'Unexpected response from service.');
      }
    } catch (err) {
      Alert.alert('System Error', err?.message || 'Unexpected error occurred during enrollment.');
    } finally {
      setIsFinalizing(false);
    }
  };

  const computeAverageAndNormalize = vectors => {
    if (!vectors || vectors.length === 0) return [];
    const normalized = vectors.map(v => normalizeVector(v));
    const dim = normalized[0].length;
    const sum = new Array(dim).fill(0);
    normalized.forEach(vec => { vec.forEach((v, i) => { sum[i] += v; }); });
    const avg = sum.map(v => v / normalized.length);
    return normalizeVector(avg);
  };
  */

  // --- UI States ---
  if (hasPermission === null)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  if (hasPermission === false)
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Camera permission required.</Text>
      </View>
    );
  if (!device)
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No Camera Found</Text>
      </View>
    );

  const currentStepData = CAPTURE_STEPS[currentStep];

  return (
    <View style={styles.container}>
      {/* Full Screen Camera */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused && cameraReady && !isFinalizing}
        photo={true}
        orientation="portrait"
        outputOrientation="portrait"
        onInitialized={() => setCameraReady(true)}
      />

      {/* Overlay component (Oval) */}
      <FacePositionOverlay />

      {/* Top UI Overlay */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.progressBarContainer}>
          {CAPTURE_STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                i < currentStep && styles.segmentCompleted,
                i === currentStep && styles.segmentActive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepCounter}>
          STEP {currentStep + 1} / {CAPTURE_STEPS.length}
        </Text>
      </SafeAreaView>

      {/* Floating Switch Button */}
      <TouchableOpacity
        style={styles.floatingSwitch}
        onPress={() =>
          setCameraPosition(p => (p === 'front' ? 'back' : 'front'))
        }
        disabled={isCapturing || isFinalizing}
      >
        <SwitchIcon />
      </TouchableOpacity>

      {/* Bottom UI Overlay */}
      <View style={styles.bottomOverlay}>
        <View style={styles.glassCard}>
          <Text style={styles.instructionTitle}>{currentStepData.title}</Text>
          <Text style={styles.instructionDesc}>{currentStepData.desc}</Text>

          <View style={styles.statusBadge}>
            <Text
              style={[
                styles.statusText,
                statusText.includes('Ready') && styles.statusReady,
                statusText.includes('Good') && styles.statusGood,
              ]}
            >
              {statusText}
            </Text>
          </View>

          <View style={styles.captureArea}>
            {isCapturing || isFinalizing ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <TouchableOpacity
                style={[
                  styles.captureButton,
                  !cameraReady && styles.captureButtonDisabled,
                  isCaptureEnabled && { borderColor: '#22c55e' },
                ]}
                onPress={handleCapture}
                disabled={!cameraReady || !isCaptureEnabled}
              >
                <View style={styles.captureInner} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 10,
  },
  progressBarContainer: {
    flexDirection: 'row',
    height: 4,
    gap: 6,
    marginBottom: 8,
  },
  progressSegment: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  segmentActive: { backgroundColor: '#ffffff' },
  segmentCompleted: { backgroundColor: '#22c55e' },
  stepCounter: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  glassCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  instructionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  instructionDesc: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  statusText: { color: '#fbbf24', fontSize: 13, fontWeight: '700' },
  statusReady: { color: '#22c55e' },
  statusGood: { color: '#60a5fa' },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#ffffff',
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    backgroundColor: '#ffffff',
  },
  captureButtonDisabled: { opacity: 0.3 },
  floatingSwitch: {
    position: 'absolute',
    top: height * 0.15,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
  },
  curveTop: {
    position: 'absolute',
    top: 2,
    width: 18,
    height: 10,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: '#ffffff',
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
  },
  curveBottom: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 10,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: '#ffffff',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  arrowHead: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
  },
  arrowHeadTop: {
    top: 9,
    right: 0,
    transform: [{ rotate: '180deg' }],
  },
  arrowHeadBottom: {
    bottom: 9,
    left: 0,
    transform: [{ rotate: '0deg' }],
  },
  errorText: { color: '#ef4444', fontSize: 16 },
});
