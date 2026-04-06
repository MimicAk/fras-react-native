import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  Alert,
  Dimensions,
  StatusBar,
  PermissionsAndroid,
  Platform,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevices, useFrameProcessor } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const GridImageCapture = ({
  maxImages = 6,
  imagesPerRow = 3,
  onImagesChange,
  imageQuality = 0.8,
  containerStyle,
  imageSlotStyle,
  addButtonStyle,
  title = "Capture Images",
  showTitle = true,
}) => {
  const [capturedImages, setCapturedImages] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [cameraPermission, setCameraPermission] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraType, setCameraType] = useState('back');
  const [flashMode, setFlashMode] = useState('off');
  const [isActive, setIsActive] = useState(false);

  const camera = useRef(null);
  const devices = useCameraDevices();
  console.log("devices",devices)
  // Calculate image slot dimensions
  const imageSlotSize = (screenWidth - 80 - ((imagesPerRow - 1) * 16)) / imagesPerRow;

  // Request camera permissions
  const requestCameraPermission = async () => {
    try {
      const cameraPermission = await Camera.requestCameraPermission();
      const microphonePermission = await Camera.requestMicrophonePermission();
      
      if (cameraPermission === 'granted') {
        setCameraPermission(true);
        return true;
      } else {
        setCameraPermission(false);
        return false;
      }
    } catch (error) {
      console.error('Permission error:', error);
      setCameraPermission(false);
      return false;
    }
  };

  // Check permissions on component mount
  useEffect(() => {
    const checkPermissions = async () => {
      const cameraStatus = await Camera.getCameraPermissionStatus();
      console.log("cameraStatus",cameraStatus)
      setCameraPermission(cameraStatus === 'granted');
    };
    checkPermissions();
  }, []);

  // Open camera for capture
  const openCamera = async () => {
    if (capturedImages.length >= maxImages) {
      Alert.alert(
        'Maximum Images Reached',
        `You can only capture up to ${maxImages} images.`,
        [{ text: 'OK', onPress: () => {} }]
      );
      return;
    }

    const hasPermission = await requestCameraPermission();
    if (hasPermission && devices) {
      setShowCamera(true);
      setIsActive(true);
    } else if (!devices) {
      Alert.alert('Camera Error', 'No camera device available.');
    } else {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera permission to capture images.',
        [{ text: 'OK', onPress: () => {} }]
      );
    }
  };

  // Close camera
  const closeCamera = () => {
    setShowCamera(false);
    setIsActive(false);
    setFlashMode('off');
  };

  // Take picture using Vision Camera
  const takePicture = async () => {
    if (isCapturing || !camera.current) return;
    
    setIsCapturing(true);
    
    try {
      const photo = await camera.current.takePhoto({
        quality: imageQuality,
        skipMetadata: false,
        flash: flashMode,
      });

      // Convert to base64
      const base64Data = await convertPhotoToBase64(photo);
      
      const newImage = {
        id: Date.now() + Math.random(),
        uri: `file://${photo.path}`,
        base64: base64Data,
        timestamp: new Date().toISOString(),
        width: photo.width || 1200,
        height: photo.height || 900,
        fileSize: base64Data.length,
        cameraType: cameraType,
        flashMode: flashMode,
      };

      const updatedImages = [...capturedImages, newImage];
      setCapturedImages(updatedImages);
      
      if (onImagesChange) {
        onImagesChange(updatedImages);
      }

      setIsCapturing(false);
      setShowCamera(false);
      setIsActive(false);

      Alert.alert(
        'Photo Captured Successfully!',
        `Image ${updatedImages.length} of ${maxImages} captured using ${cameraType} camera.`,
        [{ text: 'OK', onPress: () => {} }]
      );
    } catch (error) {
      console.error('Camera capture error:', error);
      setIsCapturing(false);
      Alert.alert('Error', 'Failed to capture image. Please try again.');
    }
  };

  // Convert photo to base64 (you'll need to implement this based on your needs)
  const convertPhotoToBase64 = async (photo) => {
    try {
      // You can use react-native-fs or similar library to read file and convert to base64
      // For demo purposes, we'll simulate this
      const mockBase64 = generateMockBase64Image();
      return mockBase64;
    } catch (error) {
      console.error('Base64 conversion error:', error);
      return generateMockBase64Image();
    }
  };

  // Generate mock base64 image (replace with actual conversion)
  const generateMockBase64Image = () => {
    const realJPEGBase64Samples = [
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
    ];
    
    const baseImage = realJPEGBase64Samples[Math.floor(Math.random() * realJPEGBase64Samples.length)];
    return baseImage + btoa(Date.now().toString()).slice(0, 30);
  };

  // Toggle camera type
  const toggleCameraType = () => {
    setCameraType(cameraType === 'back' ? 'front' : 'back');
  };

  // Toggle flash mode
  const toggleFlashMode = () => {
    const modes = ['off', 'on', 'auto'];
    const currentIndex = modes.indexOf(flashMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setFlashMode(modes[nextIndex]);
  };

  // Delete image
  const deleteImage = (imageId) => {
    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedImages = capturedImages.filter(img => img.id !== imageId);
            setCapturedImages(updatedImages);
            if (onImagesChange) {
              onImagesChange(updatedImages);
            }
          }
        }
      ]
    );
  };

  // Open image preview
  const openPreview = (index) => {
    setPreviewIndex(index);
    setShowPreview(true);
  };

  // Render image slot
  const renderImageSlot = (item, index) => {
    if (item && item.uri) {
      // Render captured image
      return (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.imageSlot,
            { width: imageSlotSize, height: imageSlotSize },
            imageSlotStyle,
          ]}
          onPress={() => openPreview(index)}
        >
          <Image
            source={{ uri: item.uri }}
            style={styles.capturedImage}
            resizeMode="cover"
          />
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteImage(item.id)}
          >
            <Text style={styles.deleteButtonText}>×</Text>
          </TouchableOpacity>
          <View style={styles.imageIndex}>
            <Text style={styles.imageIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.cameraTypeIndicator}>
            <Text style={styles.cameraTypeText}>
              {item.cameraType === 'front' ? '🤳' : '📷'}
            </Text>
          </View>
        </TouchableOpacity>
      );
    } else {
      // Render empty slot or add button
      const isAddButton = index === capturedImages.length && capturedImages.length < maxImages;
      
      return (
        <TouchableOpacity
          key={`slot-${index}`}
          style={[
            styles.imageSlot,
            styles.emptySlot,
            { width: imageSlotSize, height: imageSlotSize },
            isAddButton && styles.addButtonSlot,
            imageSlotStyle,
            isAddButton && addButtonStyle,
          ]}
          onPress={isAddButton ? openCamera : undefined}
          activeOpacity={isAddButton ? 0.7 : 1}
        >
          {isAddButton ? (
            <View style={styles.addButton}>
              <Text style={styles.addButtonIcon}>+</Text>
              <Text style={styles.addButtonText}>Add Photo</Text>
            </View>
          ) : (
            <View style={styles.emptySlotContent}>
              <Text style={styles.emptySlotNumber}>{index + 1}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }
  };

  // Create grid data
  const createGridData = () => {
    const gridData = [];
    const totalSlots = Math.min(maxImages, capturedImages.length + 1);
    
    for (let i = 0; i < totalSlots; i++) {
      gridData.push(capturedImages[i] || null);
    }
    
    // Fill remaining slots if needed
    while (gridData.length < maxImages) {
      gridData.push(null);
    }
    
    return gridData;
  };

  // Get flash icon
  const getFlashIcon = () => {
    switch (flashMode) {
      case 'on': return '⚡';
      case 'auto': return '🌟';
      default: return '💡';
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Title */}
      {showTitle && (
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {capturedImages.length} / {maxImages} images captured
          </Text>
        </View>
      )}

      {/* Image Grid */}
      <View style={styles.gridContainer}>
        <FlatList
          data={createGridData()}
          renderItem={({ item, index }) => renderImageSlot(item, index)}
          numColumns={imagesPerRow}
          keyExtractor={(item, index) => item?.id || `slot-${index}`}
          scrollEnabled={false}
          columnWrapperStyle={imagesPerRow > 1 ? styles.row : null}
          contentContainerStyle={styles.gridContent}
        />
      </View>

      {/* Vision Camera Modal */}
      <Modal
        visible={showCamera}
        transparent={false}
        animationType="slide"
        onRequestClose={closeCamera}
      >
        <View style={styles.cameraContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          {/* Camera Header */}
          <View style={styles.cameraHeader}>
            <TouchableOpacity style={styles.headerButton} onPress={closeCamera}>
              <Text style={styles.headerButtonText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>
              ({capturedImages.length + 1}/{maxImages})
            </Text>
            <TouchableOpacity style={styles.headerButton} onPress={toggleFlashMode}>
              <Text style={styles.headerButtonText}>{getFlashIcon()}</Text>
            </TouchableOpacity>
          </View>

          {/* Vision Camera View */}
          <View style={styles.cameraViewContainer}>
            {devices[0] && isActive ? (
              <Camera
                ref={camera}
                style={styles.visionCamera}
                device={devices[0]}
                isActive={isActive}
                photo={true}
                video={false}
                enableZoomGesture={true}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.cameraPlaceholderText}>
                  {!devices[0] ? 'No camera device available' : 'Initializing camera...'}
                </Text>
              </View>
            )}
            
            {/* Camera Overlay */}
            <View style={styles.cameraOverlay}>
              <View style={styles.focusFrame}>
                <View style={styles.focusCorner} />
                <View style={[styles.focusCorner, styles.focusCornerTR]} />
                <View style={[styles.focusCorner, styles.focusCornerBL]} />
                <View style={[styles.focusCorner, styles.focusCornerBR]} />
              </View>
              
              {/* Camera Info */}
              <View style={styles.cameraInfo}>
                <Text style={styles.cameraInfoText}>
                  {cameraType.toUpperCase()} CAMERA • FLASH: {flashMode.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Camera Controls */}
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={[styles.captureButton, isCapturing && styles.capturingButton]}
              onPress={takePicture}
              disabled={isCapturing || !devices}
            >
              <View style={[styles.captureInner, isCapturing && styles.capturingInner]}>
                {isCapturing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : null}
              </View>
            </TouchableOpacity>
            
          </View>
        </View>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        visible={showPreview}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.previewContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          {/* Preview Header */}
          <View style={styles.previewHeader}>
            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={() => setShowPreview(false)}
            >
              <Text style={styles.previewCloseText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.previewTitle}>
              Image {previewIndex + 1} of {capturedImages.length}
            </Text>
            <TouchableOpacity
              style={styles.previewDeleteButton}
              onPress={() => {
                deleteImage(capturedImages[previewIndex].id);
                setShowPreview(false);
              }}
            >
              <Text style={styles.previewDeleteText}>🗑️</Text>
            </TouchableOpacity>
          </View>

          {/* Preview Image */}
          <View style={styles.previewImageContainer}>
            {capturedImages[previewIndex] && (
              <Image
                source={{ uri: capturedImages[previewIndex].uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Preview Navigation */}
          <View style={styles.previewNavigation}>
            <TouchableOpacity
              style={[
                styles.navButton,
                previewIndex === 0 && styles.navButtonDisabled
              ]}
              onPress={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
              disabled={previewIndex === 0}
            >
              <Text style={[
                styles.navButtonText,
                previewIndex === 0 && styles.navButtonTextDisabled
              ]}>← Previous</Text>
            </TouchableOpacity>
            
            <View style={styles.previewDots}>
              {capturedImages.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.previewDot,
                    index === previewIndex && styles.previewDotActive
                  ]}
                  onPress={() => setPreviewIndex(index)}
                />
              ))}
            </View>
            
            <TouchableOpacity
              style={[
                styles.navButton,
                previewIndex === capturedImages.length - 1 && styles.navButtonDisabled
              ]}
              onPress={() => setPreviewIndex(Math.min(capturedImages.length - 1, previewIndex + 1))}
              disabled={previewIndex === capturedImages.length - 1}
            >
              <Text style={[
                styles.navButtonText,
                previewIndex === capturedImages.length - 1 && styles.navButtonTextDisabled
              ]}>Next →</Text>
            </TouchableOpacity>
          </View>

          {/* Image Details */}
          {capturedImages[previewIndex] && (
            <View style={styles.imageDetails}>
              <Text style={styles.imageDetailsText}>
                {capturedImages[previewIndex].width} × {capturedImages[previewIndex].height} • 
                {(capturedImages[previewIndex].fileSize / 1024).toFixed(1)}KB • 
                {capturedImages[previewIndex].cameraType} camera • 
                Flash: {capturedImages[previewIndex].flashMode}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};


const styles = StyleSheet.create({
  // Main Component Styles
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    margin: 16,
  },
  titleContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
  },
  gridContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  gridContent: {
    alignItems: 'center',
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  
  // Image Slot Styles
  imageSlot: {
    margin:1.5,
    backgroundColor: '#e9ecef',
    borderRadius: 8,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  emptySlot: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dee2e6',
    borderStyle: 'dashed',
  },
  addButtonSlot: {
    backgroundColor: '#f8f9fa',
    borderColor: '#007bff',
    borderStyle: 'dashed',
  },
  capturedImage: {
    width: '100%',
    height: '100%',
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#dc3545',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageIndex: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageIndexText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cameraTypeIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  cameraTypeText: {
    fontSize: 10,
  },
  
  // Add Button Styles
  addButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonIcon: {
    fontSize: 32,
    color: '#007bff',
    fontWeight: '300',
    marginBottom: 4,
  },
  addButtonText: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: '500',
  },
  
  // Empty Slot Styles
  emptySlotContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySlotNumber: {
    fontSize: 24,
    color: '#adb5bd',
    fontWeight: '300',
  },

  // Vision Camera Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: Platform.OS === 'ios' ? 50 : 15,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1,
  },
  headerButton: {
    padding: 8,
    width: 40,
    alignItems: 'center',
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraViewContainer: {
    flex: 1,
    position: 'relative',
  },
  visionCamera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  cameraPlaceholderText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusFrame: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  focusCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#00ff00',
    borderWidth: 3,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  focusCornerTR: {
    top: 0,
    right: 0,
    left: 'auto',
    borderLeftWidth: 0,
    borderRightWidth: 3,
  },
  focusCornerBL: {
    bottom: 0,
    top: 'auto',
    borderTopWidth: 3,
    borderBottomWidth: 3,
  },
  focusCornerBR: {
    bottom: 0,
    right: 0,
    top: 'auto',
    left: 'auto',
    borderLeftWidth: 0,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderBottomWidth: 3,
  },
  cameraInfo: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  cameraInfoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 30,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  galleryButton: {
    alignItems: 'center',
    padding: 10,
  },
  controlIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  capturingButton: {
    backgroundColor: '#007bff',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  capturingInner: {
    backgroundColor: '#0056b3',
  },
  flipButton: {
    alignItems: 'center',
    padding: 10,
  },

  // Preview Modal Styles
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: Platform.OS === 'ios' ? 50 : 15,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  previewCloseButton: {
    padding: 8,
  },
  previewCloseText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewDeleteButton: {
    padding: 8,
  },
  previewDeleteText: {
    fontSize: 20,
  },
  previewImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: screenWidth,
    height: '100%',
  },
  previewNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  navButton: {
    padding: 10,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: '#666',
  },
  previewDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 4,
  },
  previewDotActive: {
    backgroundColor: '#fff',
  },
  imageDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
  },
  imageDetailsText: {
    color: '#adb5bd',
    fontSize: 12,
    textAlign: 'center',
  },

  // Demo Styles
  demoContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  demoContent: {
    paddingBottom: 50,
  },
  demoHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  demoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  demoDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 16,
  },
  visionFeatures: {
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  featuresTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
    marginBottom: 8,
  },
  featureItem: {
    fontSize: 12,
    color: '#495057',
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportButton: {
    backgroundColor: '#28a745',
  },
  clearButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  imageInfo: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  imageInfoText: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
});

export default GridImageCapture;