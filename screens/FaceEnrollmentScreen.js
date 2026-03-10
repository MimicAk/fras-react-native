// screens/FaceEnrollmentScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

const { width, height } = Dimensions.get('window');

const CAPTURE_STEPS = [
  { id: 1, title: 'Neutral Expression', desc: 'Look straight at the camera.' },
  { id: 2, title: 'Slight Smile', desc: 'Give a small, natural smile.' },
  { id: 3, title: 'Look Left', desc: 'Turn your head slightly to the left.' },
  { id: 4, title: 'Look Right', desc: 'Turn your head slightly to the right.' },
  { id: 5, title: 'Look Up', desc: 'Tilt your head slightly upward.' },
];

const SwitchIcon = () => (
  <View style={styles.iconContainer}>
    <View style={[styles.arrow, { transform: [{ rotate: '0deg' }] }]} />
    <View
      style={[
        styles.arrow,
        { transform: [{ rotate: '180deg' }], marginTop: -4 },
      ]}
    />
  </View>
);

import FacePositionOverlay from '../components/FacePositionOverlay';
import {
  getFaceEmbeddingFromImage,
  checkFaceQualityRealTime,
} from '../utils/FaceRecognitionUtil';
import {
  enrollFaceService,
  updateFaceService,
  normalizeVector,
} from '../services/face.service';
import { connectToDatabase } from '../database/connection';

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
  const [embeddings, setEmbeddings] = useState([]);
  const [referenceBase64, setReferenceBase64] = useState(null);
  const [statusText, setStatusText] = useState('Position face in oval');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // --- Business Logic (Unchanged) ---
  useEffect(() => {
    if (hasPermission === false) {
      (async () => {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert(
            'Permission Required',
            'Face enrollment needs camera access.',
          );
        }
      })();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (!staffData?.guid) {
      Alert.alert('Error', 'Missing employee information', [
        { text: 'Go Back', onPress: () => navigation.goBack() },
      ]);
    }
  }, [staffData, navigation]);

  const updateQualityFeedback = useCallback(async () => {
    if (
      !cameraRef.current ||
      !isFocused ||
      isCapturing ||
      isFinalizing ||
      !device ||
      !cameraReady
    )
      return;
    let snapshotPath = null;
    try {
      const snap = await cameraRef.current.takeSnapshot({ quality: 30 });
      snapshotPath = `file://${snap.path}`;
      const result = await checkFaceQualityRealTime(snapshotPath);
      setStatusText(
        result?.isReady
          ? 'Ready! Press Capture'
          : result?.message || 'Adjust position...',
      );
    } catch (err) {
      console.log('Quality check failed:', err);
    } finally {
      if (snapshotPath) RNFS.unlink(snapshotPath).catch(() => {});
    }
  }, [isFocused, device, cameraReady, isCapturing, isFinalizing]);

  useEffect(() => {
    if (hasPermission !== true || !device || !cameraReady) return;
    const interval = setInterval(updateQualityFeedback, 2200);
    return () => clearInterval(interval);
  }, [hasPermission, device, cameraReady, updateQualityFeedback]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isProcessing.current || !cameraReady) return;
    isProcessing.current = true;
    setIsCapturing(true);
    setStatusText('Analyzing...');

    let photoPath = null;
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'balanced',
      });
      photoPath = `file://${photo.path}`;
      const embedding = await getFaceEmbeddingFromImage(
        photoPath,
        cameraPosition,
        true,
      );
      let newEmbeddings = [...embeddings, embedding];

      if (currentStep === 0) {
        const base64 = await RNFS.readFile(photoPath, 'base64');
        setReferenceBase64(base64);
      }
      setEmbeddings(newEmbeddings);

      if (currentStep < CAPTURE_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
        setStatusText('Good! Next position...');
      } else {
        setIsFinalizing(true);
        setStatusText('Finalizing...');
        await finalizeEnrollment(newEmbeddings);
      }
    } catch (error) {
      Alert.alert('Capture Failed', error?.message || 'Try again.');
    } finally {
      setIsCapturing(false);
      isProcessing.current = false;
      if (photoPath) RNFS.unlink(photoPath).catch(() => {});
    }
  }, [
    cameraReady,
    currentStep,
    embeddings,
    cameraPosition,
    staffData,
    navigation,
  ]);

  const finalizeEnrollment = async finalEmbeddings => {
    try {
      const validEmbeddings = finalEmbeddings.filter(
        e =>
          (Array.isArray(e) || e instanceof Float32Array) && e.length === 512,
      );

      if (validEmbeddings.length === 0) {
        Alert.alert('Face Error', 'No valid face embeddings captured.');
        return;
      }

      // const avgEmbedding = computeAverageAndNormalize(validEmbeddings);


      const avgEmbedding = validEmbeddings[0];

      const db = await connectToDatabase();

      const result = await updateFaceService({
        db,
        staffData,
        base64: referenceBase64,
        embedding: avgEmbedding,
        cameraType: cameraPosition,
      });

      console.log('Enrollment result:', result);

      // SUCCESS
      if (result?.status === 'success') {
        // navigation.navigate('EnrolledEmployeeTab', {
        //   enrolledResult: {
        //     uuid: staffData.guid,
        //   },
        // });

        onEnrollmentSuccess?.();
        navigation.goBack();

        return;
      }

      // DUPLICATE FACE
      if (result?.status === 'duplicate') {
        Alert.alert('Duplicate Face', result.message);
        return;
      }

      // SERVICE ERROR
      if (result?.status === 'error') {
        Alert.alert('Enrollment Error', result.message);
        return;
      }

      // UNKNOWN ERROR
      Alert.alert('Enrollment Failed', 'Unexpected response from service.');
    } catch (err) {
      console.error('Enrollment crash:', err);

      Alert.alert(
        'System Error',
        err?.message || 'Unexpected error occurred during enrollment.',
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  const computeAverageAndNormalize = vectors => {
    if (!vectors || vectors.length === 0) return [];

    // Use the first vector to determine dimension (assuming all have same length)
    const dim = vectors[0].length;

    // Optional: basic validation (you can remove if you trust the input)
    if (!Number.isInteger(dim) || dim <= 0) {
      console.warn('Invalid or empty dimension in first vector');
      return [];
    }

    // Initialize sum vector
    const sum = new Array(dim).fill(0);

    // Accumulate all vectors
    vectors.forEach(vec => {
      // Optional: skip invalid vectors (uncomment if needed)
      if (!Array.isArray(vec) || vec.length !== dim) return;

      vec.forEach((v, i) => {
        sum[i] += v;
      });
    });

    // Compute average
    const avg = sum.map(s => s / vectors.length);

    return avg;
  };

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
                ]}
                onPress={handleCapture}
                disabled={!cameraReady}
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
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
  },
  errorText: { color: '#ef4444', fontSize: 16 },
});
