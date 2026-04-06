// LocationService.js
import { 
  NativeModules, 
  NativeEventEmitter, 
  PermissionsAndroid, 
  Platform,
  AppState 
} from 'react-native';

const { LocationModule } = NativeModules;

class LocationService {
  constructor() {
    this.eventEmitter = new NativeEventEmitter(LocationModule);
    this.subscribers = {
      location: [],
      error: [],
      status: [],
      provider: []
    };
    
    this.isTracking = false;
    this.appStateSubscription = null;
    
    this.setupEventListeners();
    this.setupAppStateListener();
  }

  setupEventListeners() {
    // Location updates
    this.locationListener = this.eventEmitter.addListener(
      'locationUpdate',
      (location) => {
        this.subscribers.location.forEach(callback => {
          try {
            callback(location);
          } catch (error) {
            console.error('Error in location callback:', error);
          }
        });
      }
    );

    // Location errors
    this.errorListener = this.eventEmitter.addListener(
      'locationError',
      (error) => {
        this.subscribers.error.forEach(callback => {
          try {
            callback(error);
          } catch (err) {
            console.error('Error in error callback:', err);
          }
        });
      }
    );

    // Location status changes
    this.statusListener = this.eventEmitter.addListener(
      'locationStatusChange',
      (status) => {
        this.subscribers.status.forEach(callback => {
          try {
            callback(status);
          } catch (error) {
            console.error('Error in status callback:', error);
          }
        });
      }
    );

    // Provider changes
    this.providerListener = this.eventEmitter.addListener(
      'locationProviderChange',
      (provider) => {
        this.subscribers.provider.forEach(callback => {
          try {
            callback(provider);
          } catch (error) {
            console.error('Error in provider callback:', error);
          }
        });
      }
    );
  }

  setupAppStateListener() {
    // Handle app state changes for background location
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState) => {
        if (nextAppState === 'background' && this.isTracking) {
          // Optionally handle background location logic
          console.log('App went to background, location tracking continues');
        } else if (nextAppState === 'active' && this.isTracking) {
          console.log('App became active, location tracking active');
        }
      }
    );
  }

  // Request location permissions
  async requestLocationPermission(options = {}) {
    if (Platform.OS === 'ios') {
      return true; // iOS permissions handled differently
    }

    try {
      const { 
        title = 'Location Permission',
        message = 'This app needs access to location to provide location-based features.',
        requestBackground = false 
      } = options;

      // Request fine location permission
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title,
          message,
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      let backgroundGranted = true;
      
      // Request background location if needed (Android 10+)
      if (requestBackground && Platform.Version >= 29 && granted === PermissionsAndroid.RESULTS.GRANTED) {
        backgroundGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'Background Location Permission',
            message: 'This app needs background location access for continuous tracking.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        ) === PermissionsAndroid.RESULTS.GRANTED;
      }

      return {
        location: granted === PermissionsAndroid.RESULTS.GRANTED,
        background: backgroundGranted
      };
    } catch (err) {
      console.warn('Error requesting location permission:', err);
      return { location: false, background: false };
    }
  }

  // Check current permissions
  async checkLocationPermission() {
    if (Platform.OS === 'ios') {
      return LocationModule.hasLocationPermission();
    }

    try {
      const fineLocation = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      
      const coarseLocation = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
      );

      let backgroundLocation = true;
      if (Platform.Version >= 29) {
        backgroundLocation = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
        );
      }

      return {
        location: fineLocation || coarseLocation,
        background: backgroundLocation
      };
    } catch (error) {
      console.warn('Error checking location permission:', error);
      return { location: false, background: false };
    }
  }

  // Get current location (one-time)
  async getCurrentLocation(options = {}) {
    try {
      const permissions = await this.requestLocationPermission(options);
      if (!permissions.location) {
        throw new Error('Location permission denied');
      }

      return await LocationModule.getCurrentLocation();
    } catch (error) {
      throw new Error(`Failed to get location: ${error.message}`);
    }
  }

  // Start continuous location updates
  async startLocationUpdates(options = {}) {
    try {
      const {
        interval = 5000,          // 5 seconds
        minDistance = 0,          // meters
        requestBackground = false
      } = options;

      const permissions = await this.requestLocationPermission({ 
        requestBackground 
      });
      
      if (!permissions.location) {
        throw new Error('Location permission denied');
      }

      const result = await LocationModule.startLocationUpdates(interval, minDistance);
      this.isTracking = true;
      return result;
    } catch (error) {
      throw new Error(`Failed to start location updates: ${error.message}`);
    }
  }

  // Stop location updates
  async stopLocationUpdates() {
    try {
      const result = await LocationModule.stopLocationUpdates();
      this.isTracking = false;
      return result;
    } catch (error) {
      console.warn('Error stopping location updates:', error);
      this.isTracking = false;
      throw error;
    }
  }

  // Check if location services are enabled
  async isLocationEnabled() {
    try {
      return await LocationModule.isLocationEnabled();
    } catch (error) {
      console.warn('Error checking location status:', error);
      return { locationServicesEnabled: false, gpsEnabled: false, networkEnabled: false };
    }
  }

  // Get available location providers
  async getAvailableProviders() {
    try {
      return await LocationModule.getAvailableProviders();
    } catch (error) {
      console.warn('Error getting providers:', error);
      return { all: [], enabled: [] };
    }
  }

  // Subscribe to location updates
  subscribeToLocationUpdates(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    this.subscribers.location.push(callback);
    
    return () => {
      const index = this.subscribers.location.indexOf(callback);
      if (index > -1) {
        this.subscribers.location.splice(index, 1);
      }
    };
  }

  // Subscribe to location errors
  subscribeToLocationErrors(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    this.subscribers.error.push(callback);
    
    return () => {
      const index = this.subscribers.error.indexOf(callback);
      if (index > -1) {
        this.subscribers.error.splice(index, 1);
      }
    };
  }

  // Subscribe to status changes
  subscribeToStatusChanges(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    this.subscribers.status.push(callback);
    
    return () => {
      const index = this.subscribers.status.indexOf(callback);
      if (index > -1) {
        this.subscribers.status.splice(index, 1);
      }
    };
  }

  // Subscribe to provider changes
  subscribeToProviderChanges(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    this.subscribers.provider.push(callback);
    
    return () => {
      const index = this.subscribers.provider.indexOf(callback);
      if (index > -1) {
        this.subscribers.provider.splice(index, 1);
      }
    };
  }

  // Get tracking status
  getTrackingStatus() {
    return this.isTracking;
  }

  // Utility method to calculate distance between two coordinates
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in kilometers
    return d * 1000; // Convert to meters
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  // Cleanup all listeners and stop tracking
  cleanup() {
    try {
      // Remove event listeners
      this.locationListener?.remove();
      this.errorListener?.remove();
      this.statusListener?.remove();
      this.providerListener?.remove();
      this.appStateSubscription?.remove();

      // Stop location updates
      this.stopLocationUpdates().catch(() => {});

      // Clear subscribers
      this.subscribers = {
        location: [],
        error: [],
        status: [],
        provider: []
      };

      this.isTracking = false;
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }
}

// Create singleton instance
const locationService = new LocationService();

// Export default instance and class
export default locationService;
export { LocationService };