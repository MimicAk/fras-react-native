import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  Alert,
  Dimensions,
  StatusBar,
  Platform,
  Vibration,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Camera, useCameraDevices, useCodeScanner } from 'react-native-vision-camera';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const AssetScannerMultiSelect = () => {
  // Sample asset data - replace with your actual asset data
  const sampleAssets = [
    { 
      id: 'AST001', 
      name: 'MacBook Pro 16"', 
      category: 'Laptop', 
      location: 'Office Floor 1',
      status: 'Active',
      serialNumber: 'MBP2023001'
    },
    { 
      id: 'AST002', 
      name: 'Dell Monitor 27"', 
      category: 'Monitor', 
      location: 'Office Floor 1',
      status: 'Active',
      serialNumber: 'DM2023002'
    },
    { 
      id: 'AST003', 
      name: 'iPhone 14 Pro', 
      category: 'Mobile Device', 
      location: 'Office Floor 2',
      status: 'Active',
      serialNumber: 'IP2023003'
    },
    { 
      id: 'AST004', 
      name: 'Office Chair', 
      category: 'Furniture', 
      location: 'Office Floor 1',
      status: 'Active',
      serialNumber: 'OC2023004'
    },
    { 
      id: 'AST005', 
      name: 'HP Printer', 
      category: 'Printer', 
      location: 'Office Floor 2',
      status: 'Maintenance',
      serialNumber: 'HP2023005'
    },
    { 
      id: 'AST006', 
      name: 'Conference Table', 
      category: 'Furniture', 
      location: 'Meeting Room A',
      status: 'Active',
      serialNumber: 'CT2023006'
    },
    { 
      id: 'AST007', 
      name: 'Projector', 
      category: 'Electronics', 
      location: 'Meeting Room B',
      status: 'Active',
      serialNumber: 'PJ2023007'
    },
    { 
      id: 'AST008', 
      name: 'Server Rack', 
      category: 'IT Equipment', 
      location: 'Server Room',
      status: 'Active',
      serialNumber: 'SR2023008'
    },
  ];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [hasPermission, setHasPermission] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);
  const [scannerActive, setScannerActive] = useState(false);
  
  const camera = useRef(null);
  const devices = useCameraDevices();
  const scanLineAnimation = useRef(new Animated.Value(0)).current;

  // Get unique categories and statuses for filters
  const categories = ['All', ...new Set(sampleAssets.map(asset => asset.category))];
  const statuses = ['All', ...new Set(sampleAssets.map(asset => asset.status))];

  // Request camera permission using Vision Camera
  useEffect(() => {
    const requestPermission = async () => {
      const permission = await Camera.requestCameraPermission();
      setHasPermission(permission === 'granted');
    };
    requestPermission();
  }, []);

  // Start scan line animation
  useEffect(() => {
    if (scannerActive && hasPermission) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnimation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnimation, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanLineAnimation.stopAnimation();
    }
  }, [scannerActive, hasPermission, scanLineAnimation]);

  // Built-in barcode/QR scanner using useCodeScanner
  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'code-128', 'code-39', 'code-93'],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && scannerActive) {
        const currentTime = Date.now();
        
        // Prevent rapid scanning (2 second interval)
        if (currentTime - lastScanTime < 2000) {
          return;
        }

        const scannedData = codes[0].value;
        setLastScanTime(currentTime);
        setIsScanning(true);

        // Haptic feedback
        Vibration.vibrate(100);

        console.log('Scanned QR Code:', scannedData);
        
        // Find asset by ID (assuming QR code contains asset ID)
        const scannedAsset = sampleAssets.find(asset => 
          asset.id === scannedData || 
          asset.serialNumber === scannedData ||
          scannedData.includes(asset.id)
        );
        
        if (scannedAsset) {
          // Check if already selected
          const isAlreadySelected = isAssetSelected(scannedAsset.id);
          
          if (!isAlreadySelected) {
            handleAssetSelect(scannedAsset);
          }
          
          Alert.alert(
            isAlreadySelected ? 'Asset Already Selected' : 'Asset Scanned Successfully',
            `${scannedAsset.name} (${scannedAsset.id})\n${scannedAsset.category} • ${scannedAsset.location}`,
            [
              {
                text: 'Continue Scanning',
                onPress: () => {
                  setIsScanning(false);
                  setScannerActive(true);
                }
              },
              {
                text: 'Close Scanner',
                onPress: () => {
                  closeScanner();
                }
              }
            ]
          );
        } else {
          Alert.alert(
            'Asset Not Found',
            `QR Code: ${scannedData}\n\nThis code does not match any asset in the database.`,
            [
              {
                text: 'Try Again',
                onPress: () => {
                  setIsScanning(false);
                  setScannerActive(true);
                }
              },
              {
                text: 'Close Scanner',
                onPress: () => {
                  closeScanner();
                }
              }
            ]
          );
        }

        // Reset scanning state after delay
        setTimeout(() => {
          setIsScanning(false);
        }, 1500);
      }
    },
  });

  // Filter assets based on search query and filters
  const filteredAssets = useMemo(() => {
    let filtered = sampleAssets;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(asset =>
        asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.serialNumber.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by status
    if (filterStatus !== 'All') {
      filtered = filtered.filter(asset => asset.status === filterStatus);
    }

    // Filter by category
    if (filterCategory !== 'All') {
      filtered = filtered.filter(asset => asset.category === filterCategory);
    }

    return filtered;
  }, [searchQuery, filterStatus, filterCategory, sampleAssets]);

  // Handle asset selection
  const handleAssetSelect = (asset) => {
    const isSelected = selectedAssets.some(selected => selected.id === asset.id);
    
    if (isSelected) {
      setSelectedAssets(selectedAssets.filter(selected => selected.id !== asset.id));
    } else {
      setSelectedAssets([...selectedAssets, asset]);
    }
  };

  // Remove selected asset
  const removeSelectedAsset = (assetId) => {
    setSelectedAssets(selectedAssets.filter(asset => asset.id !== assetId));
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedAssets([]);
  };

  // Check if asset is selected
  const isAssetSelected = (assetId) => {
    return selectedAssets.some(asset => asset.id === assetId);
  };

  // Handle QR scan start
  const handleQRScan = async () => {
    if (!hasPermission) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera permission to scan QR codes.',
        [{ text: 'OK', onPress: () => {} }]
      );
      return;
    }

    if (!devices) {
      Alert.alert('Camera Error', 'No camera device available.');
      return;
    }

    setShowScanner(true);
    setScannerActive(true);
  };

  // Close scanner
  const closeScanner = () => {
    setShowScanner(false);
    setScannerActive(false);
    setTorchOn(false);
    setIsScanning(false);
  };

  // Toggle torch/flashlight
  const toggleTorch = () => {
    setTorchOn(!torchOn);
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return '#28a745';
      case 'Maintenance': return '#ffc107';
      case 'Inactive': return '#dc3545';
      default: return '#6c757d';
    }
  };

  // Render dropdown item
  const renderAssetItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.assetItem,
        isAssetSelected(item.id) && styles.selectedAssetItem
      ]}
      onPress={() => handleAssetSelect(item)}
    >
      <View style={styles.assetContent}>
        <View style={styles.assetHeader}>
          <Text style={[
            styles.assetName,
            isAssetSelected(item.id) && styles.selectedAssetText
          ]}>
            {item.name}
          </Text>
          <View style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) }
          ]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.assetId}>ID: {item.id}</Text>
        <Text style={styles.assetDetails}>
          {item.category} • {item.location}
        </Text>
        <Text style={styles.serialNumber}>S/N: {item.serialNumber}</Text>
      </View>
      <View style={[
        styles.checkbox,
        isAssetSelected(item.id) && styles.checkedBox
      ]}>
        {isAssetSelected(item.id) && <Text style={styles.checkmark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );

  // Render selected asset chip
  const renderSelectedAsset = (asset) => (
    <View key={asset.id} style={styles.selectedChip}>
      <View style={styles.chipContent}>
        <Text style={styles.chipText}>{asset.name}</Text>
        <Text style={styles.chipSubText}>{asset.id}</Text>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeSelectedAsset(asset.id)}
      >
        <Text style={styles.removeButtonText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  // Render filter button
  const renderFilterButton = (title, options, selectedValue, onSelect) => (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>{title}:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.filterButton,
              selectedValue === option && styles.activeFilterButton
            ]}
            onPress={() => onSelect(option)}
          >
            <Text style={[
              styles.filterButtonText,
              selectedValue === option && styles.activeFilterButtonText
            ]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Add - Plant</Text>
      </View>

      {/* Search and Scan Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search assets by ID, name, location..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setShowDropdown(true)}
          />
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowDropdown(!showDropdown)}
          >
            <Text style={styles.toggleButtonText}>
              {showDropdown ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleQRScan}
        >
          <Text style={styles.scanButtonText}>📱 Scan QR</Text>
        </TouchableOpacity>
      </View>


      {/* Selected Assets Count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {selectedAssets.length} asset{selectedAssets.length !== 1 ? 's' : ''} selected
        </Text>
        {selectedAssets.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearAllSelections}
          >
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selected Assets Chips */}
      {selectedAssets.length > 0 && (
        <View style={styles.selectedContainer}>
          <Text style={styles.sectionTitle}>Selected Assets:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsContainer}
          >
            {selectedAssets.map(renderSelectedAsset)}
          </ScrollView>
        </View>
      )}

      {/* Assets List */}
      {showDropdown && (
        <View style={styles.dropdownContainer}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>
              Available Assets ({filteredAssets.length})
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDropdown(false)}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={filteredAssets}
            keyExtractor={(item) => item.id}
            renderItem={renderAssetItem}
            style={styles.assetsList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No assets found</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Vision Camera QR Scanner Modal */}
      <Modal
        visible={showScanner}
        transparent={false}
        animationType="slide"
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          {/* Scanner Header */}
          <View style={styles.scannerHeader}>
            <TouchableOpacity style={styles.headerButton} onPress={closeScanner}>
              <Text style={styles.headerButtonText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan Asset QR Code</Text>
            <TouchableOpacity style={styles.headerButton} onPress={toggleTorch}>
              <Text style={styles.headerButtonText}>
                {torchOn ? '🔦' : '💡'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Camera Container */}
          <View style={styles.cameraContainer}>
            {devices && hasPermission ? (
              <Camera
                ref={camera}
                style={styles.camera}
                device={devices[0]}
                isActive={scannerActive}
                codeScanner={codeScanner}
                torch={torchOn ? 'on' : 'off'}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.placeholderText}>
                  {!hasPermission ? 'Camera permission required' : !devices ? 'No camera device available' : 'Initializing camera...'}
                </Text>
              </View>
            )}
            
            {/* Scanner Overlay */}
            <View style={styles.overlay}>
              {/* Top Overlay */}
              <View style={styles.overlayTop}>
                <Text style={styles.instructionText}>
                  Position the QR code within the frame to scan an asset
                </Text>
              </View>

              {/* Middle Section with Scanner Frame */}
              <View style={styles.overlayMiddle}>
                <View style={styles.overlayLeft} />
                
                <View style={styles.scannerFrame}>
                  {/* Corner Indicators */}
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                  
                  {/* Scanning Line */}
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        transform: [
                          {
                            translateY: scanLineAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 200],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  
                  {/* Success Indicator */}
                  {isScanning && (
                    <View style={styles.successIndicator}>
                      <Text style={styles.successText}>✓</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.overlayRight} />
              </View>

              {/* Bottom Overlay */}
              <View style={styles.overlayBottom}>
                <Text style={styles.tipText}>
                  Align the QR code within the frame for automatic scanning
                </Text>
              </View>
            </View>
          </View>

          {/* Scanner Controls */}
          <View style={styles.scannerControls}>
            <TouchableOpacity style={styles.flashButton} onPress={toggleTorch}>
              <Text style={styles.controlIcon}>
                {torchOn ? '🔦' : '💡'}
              </Text>
              <Text style={styles.controlLabel}>
                {torchOn ? 'Flash On' : 'Flash Off'}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.statusContainer}>
              {isScanning ? (
                <View style={styles.scanningStatus}>
                  <ActivityIndicator size="small" color="#00ff00" />
                  <Text style={styles.scanningText}>Processing...</Text>
                </View>
              ) : (
                <Text style={styles.readyText}>Ready to scan</Text>
              )}
            </View>
            
            <TouchableOpacity style={styles.closeButtonControl} onPress={closeScanner}>
              <Text style={styles.controlIcon}>✕</Text>
              <Text style={styles.controlLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!showDropdown && <View style={styles.bottomSpacing} />}
    </SafeAreaView>
  );
};
export default AssetScannerMultiSelect;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
  },
  controlsContainer: {
    flexDirection: 'row',
    margin: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212529',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderLeftWidth: 1,
    borderLeftColor: '#dee2e6',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#6c757d',
  },
  scanButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  filtersSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterContainer: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  filterButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  activeFilterButton: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#495057',
  },
  activeFilterButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  countContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  countText: {
    fontSize: 14,
    color: '#6c757d',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#dc3545',
    borderRadius: 6,
  },
  clearButtonText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  selectedContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    borderRadius: 12,
    paddingLeft: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 120,
  },
  chipContent: {
    flex: 1,
  },
  chipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  chipSubText: {
    color: '#b3d9ff',
    fontSize: 12,
  },
  removeButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dropdownContainer: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    maxHeight: 500,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#6c757d',
    fontWeight: 'bold',
  },
  assetsList: {
    maxHeight: 400,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  selectedAssetItem: {
    backgroundColor: '#e7f3ff',
  },
  assetContent: {
    flex: 1,
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  assetName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  selectedAssetText: {
    color: '#007bff',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  assetId: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '500',
    marginBottom: 2,
  },
  assetDetails: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 2,
  },
  serialNumber: {
    fontSize: 11,
    color: '#adb5bd',
    fontFamily: 'monospace',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#dee2e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkedBox: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },

  // Vision Camera Scanner Styles
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: Platform.OS === 'ios' ? 50 : 15,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  placeholderText:{}
});