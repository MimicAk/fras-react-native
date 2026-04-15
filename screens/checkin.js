// screens/CheckIn.js

import React, { useState, useEffect, useRef } from 'react';
import {
  Dimensions,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';

import colors from '../constants/colors';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { SwitchCamera } from 'lucide-react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import SoundPlayer from 'react-native-sound-player';

import ImageResizer from 'react-native-image-resizer';
import RNFS from 'react-native-fs';

import { connectToDatabase } from '../database/connection';
import { createTables } from '../database/schema';

import ActiveCheckinPopup from '../components/ActiveCheckinPopup';
import FacePositionOverlay from '../components/FacePositionOverlay';

import SmallAlert from '../components/AttendanceComps/SmallAlert';

import {
  loadVectorsService,
  recognizeFaceService,
  improveFaceModelService,
  normalizeVector,
  setCurrentUser,
} from '../services/face.service';

import {
  processCheckInService,
  processCheckoutAndCheckinService,
  manualEntryService,
} from '../services/attendance.service';

import FaceConfirmationPopup from '../components/AttendanceComps/FaceConfirmationPopup';
import MultipleMatchPopup from '../components/AttendanceComps/MultipleMatchPopup';

import { useAuth } from '../AuthContext';
import { getFaceEmbeddingFromImage } from '../utils/FaceRecognitionUtil';

const { width, height } = Dimensions.get('window');

function CheckInScreen({
  navigation,
  currentLocation,
  nearyByProject,
  attendanceType,
}) {
  const isFocused = useIsFocused();

  const { user } = useAuth();

  setCurrentUser(user?.id);
  const successSound = require('../assets/sounds/success.mp3');
  const warningSound = require('../assets/sounds/warning.mp3');

  const { hasPermission, requestPermission } = useCameraPermission();

  const [cameraPosition, setCameraPosition] = useState('back');
  const [db, setDb] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [currentProject, setCurrentProject] = useState(null);
  const [empID, setEmpID] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info',
    message: '',
  });

  const [showActivePopup, setShowActivePopup] = useState(false);
  const [pendingPerson, setPendingPerson] = useState(null);
  const [activeDetails, setActiveDetails] = useState(null);

  const [matchedPersons, setMatchedPersons] = useState([]);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // PHOTO STATES
  const [autoPhoto, setAutoPhoto] = useState(null); // For Auto Match

  // MANUAL ENTRY STATES
  const [isManualMode, setIsManualMode] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualPhoto, setManualPhoto] = useState(null);

  const [capturedEmbedding, setCapturedEmbedding] = useState(null);

  const cameraRef = useRef(null);
  const captureInterval = useRef(null);
  const isProcessing = useRef(false);

  const device = useCameraDevice(cameraPosition);

  const getProjectName = () => {
    if (!nearyByProject || nearyByProject.length === 0) {
      return 'No Projects';
    }
    if (nearyByProject.length > 1) {
      return currentProject?.projectname || 'Select Project';
    }
    return nearyByProject[0]?.projectname || 'No Projects';
  };

  // HELPER: PROCESS PHOTO TO BASE64
  // HELPER: PROCESS AND RESIZE PHOTO TO BASE64
  const processPhotoToBase64 = async photoObj => {
    if (!photoObj || !photoObj.path) return null;

    try {
      // 1. Ensure correct path format for the original image
      const originalPath = photoObj.path.startsWith('file://')
        ? photoObj.path
        : `file://${photoObj.path}`;

      // 2. Resize the image
      // Parameters: path, maxWidth, maxHeight, format, quality (0-100), rotation
      // 800x800 at 80% quality is usually the sweet spot for accurate face recognition without bloat
      const resizedImage = await ImageResizer.createResizedImage(
        originalPath,
        500,
        500,
        'JPEG',
        70,
        0,
        null, // null defaults to a temporary cache directory
      );

      // 3. Read the newly resized, lightweight image into Base64
      const base64String = await RNFS.readFile(resizedImage.uri, 'base64');

      // 4. (Optional but recommended) Clean up the cached resized image to save storage
      RNFS.unlink(resizedImage.uri).catch(err =>
        console.log('Failed to clean up resized image cache:', err),
      );

      return base64String;
    } catch (err) {
      console.error('Image Resizing / Base64 Processing Error:', err);
      return null;
    }
  };

  // INIT
  useEffect(() => {
    if (!isFocused) return;

    const bootstrap = async () => {
      try {
        const database = await connectToDatabase();
        await createTables(database);
        await loadVectorsService(database);
        setInitialized(true);
        setDb(database);

        const projectJson = await AsyncStorage.getItem('Project');
        setCurrentProject(projectJson ? JSON.parse(projectJson) : null);
      } catch (err) {
        console.error('Init failed:', err);
        setErrorMsg('Failed to initialize. Please restart the app.');
      }
    };

    bootstrap();
  }, [isFocused]);

  // CAMERA PERMISSION
  useEffect(() => {
    if (hasPermission === false) {
      (async () => {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert(
            'Camera Access Required',
            'This feature needs camera permission to recognize faces.',
            [
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings?.(),
              },
              { text: 'Cancel', style: 'cancel' },
            ],
          );
        }
      })();
    }
  }, [hasPermission, requestPermission]);

  // AUTO CAPTURE INTERVAL
  useEffect(() => {
    const isPopupOpen =
      showConfirmation ||
      showActivePopup ||
      matchedPersons.length > 0 ||
      showManualModal;

    if (
      !isFocused ||
      !initialized ||
      !db ||
      hasPermission !== true ||
      !device ||
      !cameraReady ||
      isManualMode ||
      isPopupOpen
    ) {
      if (captureInterval.current) {
        clearInterval(captureInterval.current);
        captureInterval.current = null;
      }

      return;
    }

    if (captureInterval.current) clearInterval(captureInterval.current);

    captureInterval.current = setInterval(() => {
      if (!isProcessing.current) {
        handleCapture();
      }
    }, 2200);

    return () => {
      if (captureInterval.current) clearInterval(captureInterval.current);
    };
  }, [
    isFocused,
    initialized,
    db,
    hasPermission,
    device,
    cameraReady,
    isManualMode,
  ]);

  const handleCapture = async () => {
    if (!cameraRef.current || !db) return;

    isProcessing.current = true;
    setIsWorking(true);

    try {
      const faceResult = await recognizeFaceService({
        cameraRef,
        switchCamera: cameraPosition === 'front',
      });

      if (faceResult.status === 'no_match') {
        setErrorMsg(faceResult.message);
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }

      if (faceResult.status === 'multiple') {
        setMatchedPersons(
          faceResult.matches.map(m => ({
            ...m,
            embedding: faceResult.embedding,
          })),
        );
        return;
      }

      if (faceResult.status === 'single') {
        try {
          const snap = await cameraRef.current.takePhoto({
            qualityPrioritization: 'speed',
            skipMetadata: true,
          });
          setAutoPhoto(snap);
        } catch (err) {
          console.log('Failed to capture auto snapshot:', err);
        }

        setPendingPerson(faceResult.employee);
        setCapturedEmbedding(faceResult.embedding);

        console.log(faceResult.employee);

        setShowConfirmation(true);
        return;
      }

      if (faceResult.status === 'error') {
        setErrorMsg(faceResult.message);
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }
    } catch (err) {
      setErrorMsg(err.message || 'Recognition failed');
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      isProcessing.current = false;
      setIsWorking(false);
    }
  };

  const handleManualCapture = async () => {
    if (!cameraRef.current) return;
    setIsWorking(true);
    try {
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'speed',
        skipMetadata: true,
      });
      setManualPhoto(photo);
      setShowManualModal(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to capture photo.');
    } finally {
      setIsWorking(false);
    }
  };

  const submitManualCheckIn = async () => {
    if (!manualEmpId.trim()) {
      Alert.alert('Missing Field', 'Please enter an Employee ID.');
      return;
    }

    setIsWorking(true);
    try {
      const serviceResult = await manualEntryService({
        db,
        manualEmpId: manualEmpId.trim(),
        punchType: 'in',
        currentLocation,
        nearyByProject,
        currentProject,
        attendanceType,
        user,
        photo: manualPhoto,
      });

      if (serviceResult.status === 'not_found') {
        Alert.alert('Not Found', serviceResult.message);
        return;
      }

      if (serviceResult.status === 'db_error') {
        setErrorMsg(serviceResult.message);
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }

      setShowManualModal(false);
      setManualEmpId('');
      setIsManualMode(false);

      if (serviceResult.status === 'success') {
        setEmpID(serviceResult.employee);
        try {
          SoundPlayer.playAsset(successSound);
        } catch {}
        setTimeout(() => setEmpID(null), 5000);
        return;
      }

      const base64Image = await processPhotoToBase64(manualPhoto);

      const embedding = await getFaceEmbeddingFromImage(
        manualPhoto.path,
        cameraPosition,
      );

      if (embedding) {
        improveFaceModelService({
          db,
          staffId: serviceResult.employee.staffid,
          uuid: serviceResult.employee.uuid,
          newEmbedding: normalizeVector(embedding),
          base64Image,
        });
      }

      if (serviceResult.status === 'already_checkedin') {
        try {
          SoundPlayer.playAsset(warningSound);
        } catch {}
        setAlertConfig({
          visible: true,
          type: 'error',
          message: serviceResult.message,
        });
        setTimeout(
          () => setAlertConfig(prev => ({ ...prev, visible: false })),
          3000,
        );
        return;
      }

      if (serviceResult.status === 'active_checkin') {
        try {
          SoundPlayer.playAsset(warningSound);
        } catch {}
        setPendingPerson(serviceResult.employee);
        setActiveDetails(serviceResult.details);
        setShowActivePopup(true);
        return;
      }

      setErrorMsg(serviceResult.message || 'Manual Check-in failed');
      setTimeout(() => setErrorMsg(null), 5000);
    } catch (err) {
      console.error('Manual UI Error:', err);
      setErrorMsg('An unexpected error occurred.');
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsWorking(false);
    }
  };

  if (!initialized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="white" />
          <Text style={styles.message}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.message}>Checking permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Camera permission is required.{'\n'}Please enable it in Settings.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            No {cameraPosition} camera detected.{'\n'}
            Try switching or check device settings.
          </Text>
          <TouchableOpacity
            style={styles.floatingSwitch}
            onPress={() =>
              setCameraPosition(p => (p === 'back' ? 'front' : 'back'))
            }
          >
            <SwitchCamera size={28} color="white" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused && cameraReady}
          photo={true}
          orientation="portrait"
          outputOrientation="portrait"
          onInitialized={() => setCameraReady(true)}
        />
        {!isManualMode && <FacePositionOverlay />}
      </View>

      <View style={styles.projectBadge}>
        <Text style={styles.projectText} numberOfLines={1} ellipsizeMode="tail">
          {getProjectName()}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.manualToggleBtn}
        onPress={() => setIsManualMode(!isManualMode)}
      >
        <Text style={styles.manualToggleText}>
          {isManualMode ? 'Cancel Manual' : 'Manual Entry'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.floatingSwitch}
        onPress={() =>
          setCameraPosition(p => (p === 'back' ? 'front' : 'back'))
        }
      >
        <SwitchCamera size={26} color="white" />
      </TouchableOpacity>

      <View style={styles.bottomOverlay}>
        {isWorking && (
          <ActivityIndicator
            size="large"
            color="#ffffff"
            style={{ marginBottom: 12 }}
          />
        )}

        {isManualMode && !isWorking && !showManualModal && (
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleManualCapture}
          />
        )}

        {empID && (
          <Text style={styles.successText}>✓ Checked in: {empID.name}</Text>
        )}

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {!isWorking && !empID && !errorMsg && (
          <Text style={styles.instructionText}>
            {isManualMode
              ? 'Guide employee face into frame and tap Capture'
              : 'Position your face in the frame'}
          </Text>
        )}
      </View>

      {/* MANUAL EMP ID MODAL */}
      <Modal visible={showManualModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manual Entry</Text>
            <Text style={styles.modalSubTitle}>
              Face captured successfully. Please verify Employee ID below:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Enter Employee ID"
              placeholderTextColor="#9ca3af"
              value={manualEmpId}
              onChangeText={setManualEmpId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setShowManualModal(false);
                  setManualEmpId('');
                }}
              >
                <Text style={styles.modalBtnTextDark}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit]}
                onPress={submitManualCheckIn}
              >
                <Text style={styles.modalBtnTextLight}>Verify & Check-in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ACTIVE CHECKIN SWITCH CONFIRMATION */}
      <ActiveCheckinPopup
        visible={showActivePopup}
        employee={pendingPerson}
        activeCheckin={activeDetails?.activeCheckin}
        newProject={activeDetails?.newProject}
        onConfirm={async () => {
          try {
            const photoToProcess = isManualMode ? manualPhoto : autoPhoto;
            const base64Image = await processPhotoToBase64(photoToProcess);

            await processCheckoutAndCheckinService({
              db,
              person: pendingPerson,
              activeCheckinDetails: activeDetails,
              currentLocation,
              nearyByProject,
              currentProject,
              attendanceType,
              userimage: base64Image,
            });

            setShowActivePopup(false);
            setEmpID(pendingPerson);
            try {
              SoundPlayer.playSoundFile('success', 'mp3');
            } catch {}
            setTimeout(() => setEmpID(null), 5000);
          } catch (err) {
            setErrorMsg('Switch failed: ' + (err.message || 'Unknown error'));
            setTimeout(() => setErrorMsg(null), 5000);
          }
        }}
        onCancel={() => setShowActivePopup(false)}
      />

      <MultipleMatchPopup
        visible={matchedPersons.length > 0}
        matches={matchedPersons}
        onSelect={person => {
          setMatchedPersons([]);
          setPendingPerson(person);
          setCapturedEmbedding(person.embedding);
          setShowConfirmation(true);
        }}
        onCancel={() => setMatchedPersons([])}
      />

      {/* AUTO FACE MATCH CONFIRMATION */}
      <FaceConfirmationPopup
        visible={showConfirmation}
        employee={pendingPerson}
        onConfirm={() => {
          setEmpID(pendingPerson);
          setIsWorking(true);

          try {
            SoundPlayer.playAsset(successSound);
          } catch {}

          setShowConfirmation(false);
          // setIsWorking(true);

          setTimeout(async () => {
            try {
              const base64Image = await processPhotoToBase64(autoPhoto);

              const serviceResult = await processCheckInService({
                db,
                faceResult: {
                  employee: pendingPerson,
                },
                currentLocation,
                nearyByProject,
                currentProject,
                attendanceType,
                user,
                userimage: base64Image,
              });

              if (serviceResult.status === 'success') {
                // setEmpID(serviceResult.employee);
                // try {
                //   SoundPlayer.playAsset(successSound);
                // } catch {}

                // Trigger background face improvement (Fire and forget)
                if (capturedEmbedding && autoPhoto) {
                  improveFaceModelService({
                    db,
                    staffId: pendingPerson.staffid,
                    uuid: pendingPerson.uuid,
                    newEmbedding: capturedEmbedding,
                    base64Image: base64Image,
                  }).catch(err =>
                    console.log('Background learning failed', err),
                  );
                }

                setTimeout(() => setEmpID(null), 3000);
                return;
              }

              if (serviceResult.status === 'already_checkedin') {
                try {
                  SoundPlayer.playAsset(warningSound);
                } catch {}
                setAlertConfig({
                  visible: true,
                  type: 'error',
                  message: serviceResult.message,
                });
                setTimeout(() => {
                  setAlertConfig(prev => ({ ...prev, visible: false }));
                }, 3000);
                return;
              }

              if (serviceResult.status === 'active_checkin') {
                try {
                  SoundPlayer.playAsset(warningSound);
                } catch {}
                setPendingPerson(serviceResult.employee);
                setActiveDetails(serviceResult.details);
                setShowActivePopup(true);
                return;
              }

              setErrorMsg(serviceResult.message);
              setTimeout(() => setErrorMsg(null), 3000);
            } catch (err) {
              console.error('Checkin Error:', err);
              setErrorMsg('An error occurred during check-in.');
              setTimeout(() => setErrorMsg(null), 3000);
            } finally {
              // 3. Turn off loading spinner
              setIsWorking(false);
            }
          }, 150);
        }}
        onCancel={() => setShowConfirmation(false)}
      />

      <SmallAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        message={alertConfig.message}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.primary },
  cameraContainer: { flex: 1, width: '100%', backgroundColor: '#000' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  floatingSwitch: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 25,
    right: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 999,
    padding: 14,
    zIndex: 10,
  },
  manualToggleBtn: {
    position: 'absolute',
    bottom: 125,
    alignSelf: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.9)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 10,
  },
  manualToggleText: { color: '#000', fontWeight: '700', fontSize: 14 },
  captureBtn: {
    width: 65,
    height: 65,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 5,
    borderColor: 'white',
    marginBottom: 15,
  },
  instructionText: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  successText: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  message: { marginTop: 20, fontSize: 16, color: 'white', textAlign: 'center' },
  projectBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    maxWidth: '65%',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  projectText: { fontSize: 14, fontWeight: '600', color: '#111' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubTitle: { fontSize: 14, color: '#4b5563', marginBottom: 20 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 24,
    backgroundColor: '#f9fafb',
  },
  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalBtnCancel: { backgroundColor: '#e5e7eb' },
  modalBtnSubmit: { backgroundColor: colors.primary || '#2563eb' },
  modalBtnTextDark: { color: '#374151', fontWeight: '600', fontSize: 15 },
  modalBtnTextLight: { color: 'white', fontWeight: '600', fontSize: 15 },
});

export default CheckInScreen;
