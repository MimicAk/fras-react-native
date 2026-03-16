// screens/LandingPage.js
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Dashboard from '../screens/dashboard';
import EmployeesScreen from './employee';
import HistoryScreen from './histroy';
import CheckIn from './checkin';
import CheckOut from './checkOut';
import {
  LayoutGrid,
  LogIn,
  LogOut,
  AlertTriangle,
  History,
  Users,
} from 'lucide-react-native';
import Colors from '../constants/colors';
import { useAuth } from '../AuthContext';
import {
  Text,
  View,
  Alert,
  Platform,
  PermissionsAndroid,
  AppState,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import Geolocation from 'react-native-geolocation-service';
import { isPointInPolygon } from '../utils/GPSCalc';
import { config } from '../config/config';
import { connectToDatabase } from './../database/connection';

import { createTables } from '../database/schema';
import { getAllStaff } from '../database/staff.repository';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  initBackgroundFetch,
  startForegroundSyncService,
} from '../services/backgroundWorker';
import { loadVectorsService } from '../services/face.service';

Geolocation.setRNConfiguration({
  locationProvider: 'playServices', // Android only
});

const Tab = createBottomTabNavigator();

// ────────────────────────────────────────────────
//  CONFIGURATION CONSTANTS
// ────────────────────────────────────────────────

const LOCATION_CONFIG = {
  MAX_RETRY_COUNT: 2,
  HIGH_ACCURACY_TIMEOUT: 5000,
  LOW_ACCURACY_TIMEOUT: 5000,
  LOCATION_MAX_AGE: 180000, // 3 minutes
  DEBOUNCE_DELAY: 500,
  PROJECT_DEBOUNCE_DELAY: 500,
  MIN_LOCATION_UPDATE_INTERVAL: 1000,
  DISTANCE_FILTER: 5,
  WATCH_INTERVAL: 500,
  WATCH_FASTEST_INTERVAL: 500,
  CACHE_DURATION: 1000 * 60 * 3, // 3 minutes
  BACKGROUND_LOCATION_TIMEOUT: 1000,
};

const STORAGE_KEYS = {
  PROJECT_DATA: 'project_data',
  PERMISSION_GRANTED: 'location_permission_granted',
  LOCATION_CACHE: 'location_cache_with_timestamp',
};

// ────────────────────────────────────────────────
//  DEBOUNCE UTILITY
// ────────────────────────────────────────────────

const debounce = (func, wait, immediate = false) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
};

// ────────────────────────────────────────────────
//  LOCATION CACHE
// ────────────────────────────────────────────────

class LocationCacheManager {
  static async getCachedLocation() {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_CACHE);
      if (cached) {
        const { location, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < LOCATION_CONFIG.CACHE_DURATION) {
          return location;
        }
      }
    } catch {}
    return null;
  }

  static async setCachedLocation(location) {
    try {
      const cacheData = { location, timestamp: Date.now() };
      await AsyncStorage.setItem(
        STORAGE_KEYS.LOCATION_CACHE,
        JSON.stringify(cacheData),
      );
    } catch {}
  }

  static async clearCache() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.LOCATION_CACHE);
    } catch {}
  }
}

// ────────────────────────────────────────────────
//  OPTIMIZED LOCATION MANAGER
// ────────────────────────────────────────────────

class OptimizedLocationManager {
  constructor() {
    this.watchId = null;
    this.isTracking = false;
    this.lastLocationTime = 0;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
  }

  async getCurrentLocation(useHighAccuracy = true, timeout = LOCATION_CONFIG.HIGH_ACCURACY_TIMEOUT) {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => {
          this.consecutiveErrors = 0;
          resolve(position.coords);
        },
        error => {
          this.consecutiveErrors++;
          reject(error);
        },
        {
          enableHighAccuracy: useHighAccuracy,
          timeout,
          maximumAge: useHighAccuracy ? 60000 : LOCATION_CONFIG.LOCATION_MAX_AGE,
        },
      );
    });
  }

  async getLocationWithStrategy() {
    const cached = await LocationCacheManager.getCachedLocation();
    if (cached) {
      this.backgroundLocationFetch();
      return cached;
    }

    try {
      const loc = await this.getCurrentLocation(true, LOCATION_CONFIG.HIGH_ACCURACY_TIMEOUT);
      await LocationCacheManager.setCachedLocation(loc);
      return loc;
    } catch {
      try {
        const loc = await this.getCurrentLocation(false, LOCATION_CONFIG.LOW_ACCURACY_TIMEOUT);
        await LocationCacheManager.setCachedLocation(loc);
        return loc;
      } catch (err) {
        throw err;
      }
    }
  }

  async backgroundLocationFetch() {
    try {
      await this.getCurrentLocation(true, LOCATION_CONFIG.BACKGROUND_LOCATION_TIMEOUT);
      // No logging
    } catch {}
  }

  startWatching(onSuccess, onError) {
    if (this.watchId !== null) this.stopWatching();

    this.isTracking = true;

    this.watchId = Geolocation.watchPosition(
      position => {
        const now = Date.now();
        if (now - this.lastLocationTime < LOCATION_CONFIG.MIN_LOCATION_UPDATE_INTERVAL) return;

        this.lastLocationTime = now;
        this.consecutiveErrors = 0;
        LocationCacheManager.setCachedLocation(position.coords);
        onSuccess(position.coords);
      },
      error => {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.stopWatching();
          setTimeout(() => this.isTracking && this.startWatching(onSuccess, onError), 5000);
          return;
        }
        onError(error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: LOCATION_CONFIG.DISTANCE_FILTER,
        interval: LOCATION_CONFIG.WATCH_INTERVAL,
        fastestInterval: LOCATION_CONFIG.WATCH_FASTEST_INTERVAL,
        maximumAge: 60000,
      },
    );
  }

  stopWatching() {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
  }
}

// ────────────────────────────────────────────────
//  MAIN LANDING PAGE
// ────────────────────────────────────────────────

export default function LandingPage({ navigation }) {

  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const [attendanceType, setAttendanceType] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [nearyByProject, setNearByProject] = useState([]);
  const [locationError, setLocationError] = useState(null);
  const [locationRetryCount, setLocationRetryCount] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [locationUpdateCount, setLocationUpdateCount] = useState(0);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [showGpsAlert, setShowGpsAlert] = useState(false);

  const netInfoUnsubscribe = useRef(null);
  const showRetryPopStatus = useRef(false);
  const gpsAlertShown = useRef(false);
  const previousCoords = useRef({ latitude: null, longitude: null });
  const appInitialized = useRef(false);
  const locationAttempted = useRef(false);
  const projectLoadingRef = useRef(false);
  const locationManager = useRef(new OptimizedLocationManager());

  const debouncedLocationUpdate = useCallback(
    debounce(loc => {
      setCurrentLocation(prev => {
        if (
          !prev ||
          Math.abs(loc.latitude - prev.latitude) > 0.0001 ||
          Math.abs(loc.longitude - prev.longitude) > 0.0001
        ) {
          setLocationUpdateCount(c => c + 1);
          previousCoords.current = { latitude: loc.latitude, longitude: loc.longitude };
          return loc;
        }
        return prev;
      });
    }, LOCATION_CONFIG.DEBOUNCE_DELAY),
    []
  );

  useEffect(() => {
    if (user?.token) {
      startForegroundSyncService(user.token, user);
      initBackgroundFetch(user.token);
    }
  }, [user?.token]);

  const debouncedLoadProject = useCallback(
    debounce(async (overrideLocation = null) => {
      if (projectLoadingRef.current) return;
      const loc = overrideLocation || currentLocation;

      if (!loc?.latitude || !loc?.longitude || !isConnected) {
        await loadProjectCacheData();
        return;
      }

      projectLoadingRef.current = true;
      setProjectsLoading(true);

      try {
        const requestData = {
          date: new Date().toISOString().split('T')[0],
          latitude: loc.latitude,
          longitude: loc.longitude,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(`${config.Base_URL}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user?.token}`,
          },
          body: JSON.stringify(requestData),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const projectData = data?.data;

        let nearby = [];
        if (Array.isArray(projectData?.project_lat_lng)) {
          nearby = projectData.project_lat_lng.filter(
            p => p?.project_lat_lng && isPointInPolygon(loc, p.project_lat_lng)
          );
        }

        setNearByProject(prev =>
          JSON.stringify(prev) !== JSON.stringify(nearby) ? nearby : prev
        );

        if (projectData?.all_projects) {
          await AsyncStorage.setItem(
            STORAGE_KEYS.PROJECT_DATA,
            JSON.stringify(projectData.all_projects)
          );
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          await loadProjectCacheData();
        }
      } finally {
        setProjectsLoading(false);
        projectLoadingRef.current = false;
      }
    }, LOCATION_CONFIG.PROJECT_DEBOUNCE_DELAY),
    [currentLocation, isConnected, user?.token]
  );

  const loadProjectCacheData = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.PROJECT_DATA);
      if (json && currentLocation) {
        const projects = JSON.parse(json);
        if (Array.isArray(projects)) {
          const nearby = projects.filter(
            p => p?.project_lat_lng && isPointInPolygon(currentLocation, p.project_lat_lng)
          );
          setNearByProject(prev =>
            JSON.stringify(prev) !== JSON.stringify(nearby) ? nearby : prev
          );
        }
      }
    } catch {}
  };

  const checkLocationPermission = async () => {
    if (Platform.OS !== 'android') {
      setPermissionStatus('granted');
      return true;
    }

    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.PERMISSION_GRANTED);
      if (cached === 'true') {
        const stillOk = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (stillOk) {
          setPermissionStatus('granted');
          return true;
        }
      }

      const already = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (already) {
        setPermissionStatus('granted');
        await AsyncStorage.setItem(STORAGE_KEYS.PERMISSION_GRANTED, 'true');
        return true;
      }

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Access Required',
          message: 'This app needs location access for attendance tracking.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );

      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      setPermissionStatus(granted ? 'granted' : 'denied');
      if (granted) await AsyncStorage.setItem(STORAGE_KEYS.PERMISSION_GRANTED, 'true');
      return granted;
    } catch {
      setPermissionStatus('denied');
      return false;
    }
  };

  const checkGPSStatus = async () => {
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(true), 3000);

      Geolocation.getCurrentPosition(
        () => {
          clearTimeout(timeout);
          setGpsEnabled(true);
          resolve(true);
        },
        err => {
          clearTimeout(timeout);
          const disabled = err.code === 2;
          setGpsEnabled(!disabled);
          resolve(!disabled);
        },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 60000 }
      );
    });
  };

  const attemptLocationFetch = async (showLoader = true) => {
    if (locationAttempted.current && currentLocation) return currentLocation;

    if (showLoader) setLocationLoading(true);
    setLocationError(null);

    try {
      const permitted = await checkLocationPermission();
      if (!permitted) {
        if (showLoader) setLocationLoading(false);
        showRetryPopup();
        return null;
      }

      const gpsOk = await checkGPSStatus();
      if (!gpsOk) {
        if (showLoader) setLocationLoading(false);
        showGPSDisabledAlert();
        return null;
      }

      locationAttempted.current = true;

      const loc = await locationManager.current.getLocationWithStrategy();

      if (loc) {
        debouncedLocationUpdate(loc);
        setLocationError(null);
        setLocationRetryCount(0);
        startOptimizedLocationTracking();
        if (showLoader) setLocationLoading(false);
        return loc;
      }
    } catch (err) {
      setLocationError(err.message);

      if (locationRetryCount < LOCATION_CONFIG.MAX_RETRY_COUNT) {
        setLocationRetryCount(c => c + 1);
        setTimeout(() => {
          locationAttempted.current = false;
          attemptLocationFetch(showLoader);
        }, 2000);
      } else {
        if (showLoader) setLocationLoading(false);
        showRetryPopup();
      }
    }
    return null;
  };

  const startOptimizedLocationTracking = async () => {
    const permitted = await checkLocationPermission();
    if (!permitted || !gpsEnabled) {
      setIsTrackingLocation(false);
      return;
    }

    locationManager.current.startWatching(
      loc => {
        setIsTrackingLocation(true);
        setGpsEnabled(true);
        debouncedLocationUpdate(loc);
        setLocationError(null);

        const latDiff = Math.abs(loc.latitude - (previousCoords.current.latitude || 0)) > 0.0002;
        const lonDiff = Math.abs(loc.longitude - (previousCoords.current.longitude || 0)) > 0.0002;

        if (latDiff || lonDiff) {
          debouncedLoadProject(loc);
        }
      },
      err => {
        setLocationError(err.message);
        setIsTrackingLocation(false);
        if (err.code === 2) {
          setGpsEnabled(false);
          showGPSDisabledAlert();
        }
      }
    );
  };

  const stopLocationTracking = () => {
    locationManager.current.stopWatching();
    setIsTrackingLocation(false);
  };

  const refreshLocationAndTracking = async () => {
    stopLocationTracking();
    await LocationCacheManager.clearCache();
    locationAttempted.current = false;
    setLocationRetryCount(0);
    return await attemptLocationFetch(false);
  };

  const showGPSDisabledAlert = () => {
    if (gpsAlertShown.current || showGpsAlert) return;
    gpsAlertShown.current = true;
    setShowGpsAlert(true);

    Alert.alert(
      'GPS Required',
      'Please enable GPS/Location Services for attendance tracking.',
      [
        {
          text: 'Settings',
          onPress: () => {
            setShowGpsAlert(false);
            gpsAlertShown.current = false;
            openLocationSettings();
          },
        },
        {
          text: 'Retry',
          onPress: async () => {
            setShowGpsAlert(false);
            gpsAlertShown.current = false;
            await refreshLocationAndTracking();
          },
        },
      ],
      { cancelable: false }
    );
  };

  const showRetryPopup = () => {
    if (showRetryPopStatus.current) return;
    showRetryPopStatus.current = true;

    Alert.alert(
      'Location Required',
      'Unable to get your location. Please ensure GPS and location permissions are enabled.',
      [
        {
          text: 'Settings',
          onPress: () => {
            showRetryPopStatus.current = false;
            openLocationSettings();
          },
        },
        {
          text: 'Retry',
          onPress: async () => {
            showRetryPopStatus.current = false;
            await refreshLocationAndTracking();
          },
        },
      ]
    );
  };

  const openLocationSettings = () => {
    if (Platform.OS === 'android') {
      Linking.openSettings().catch(() => Linking.openURL('app-settings:'));
    } else {
      Linking.openURL('app-settings:').catch(() => Linking.openSettings());
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      if (appInitialized.current) return;
      appInitialized.current = true;

      try {
        netInfoUnsubscribe.current = NetInfo.addEventListener(state =>
          setIsConnected(state.isConnected)
        );

        const loc = await attemptLocationFetch(false);
        if (loc) debouncedLoadProject(loc);

        return () => {
          netInfoUnsubscribe.current?.();
          stopLocationTracking();
        };
      } catch {}
    };

    initializeApp();
  }, []);

  useEffect(() => {
    const handleAppState = async nextState => {
      if (nextState === 'active') {
        gpsAlertShown.current = false;

        if (!currentLocation || !isTrackingLocation) {
          const permitted = await checkLocationPermission();
          const gpsOk = await checkGPSStatus();

          if (permitted && gpsOk) {
            if (!currentLocation) {
              locationAttempted.current = false;
              attemptLocationFetch(false);
            } else if (!isTrackingLocation) {
              startOptimizedLocationTracking();
            }
          }
        }
      } else if (nextState === 'background') {
        stopLocationTracking();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub?.remove();
  }, [currentLocation, isTrackingLocation]);

  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude) {
      debouncedLoadProject();
    }
  }, [currentLocation, isConnected, debouncedLoadProject]);

  useEffect(() => {
    (async () => {
      try {
        const type = await AsyncStorage.getItem('AttendanceType');
        setAttendanceType(type);
      } catch {}
      finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const checkSyncDataNeeded = async () => {
      try {
        const db = await connectToDatabase();
        await createTables(db);
        const staff = await getAllStaff(db);
        const lastSync = await AsyncStorage.getItem('lastsyncdate');

        if (staff?.length === 0 && !lastSync) {
          setTimeout(() => {
            Alert.alert(
              'Action Required',
              'Sync data to your device',
              [{ text: 'Sync', onPress: () => navigation.navigate('SyncData') }],
              { cancelable: false }
            );
          }, 500);
        }

        // loadVectorsService(db);
      } catch {}
    };

    const id = setTimeout(checkSyncDataNeeded, 1000);
    return () => clearTimeout(id);
  }, [navigation]);

  const mobilePermissions = useMemo(() => {
    if (!user?.roles || !Array.isArray(user.roles) || attendanceType === null) return [];

    const perms = user.roles
      .filter(role => attendanceType === role.guid && role.mobile_permission)
      .flatMap(role => {
        try {
          return JSON.parse(role.mobile_permission) || [];
        } catch {
          return [];
        }
      });

    const unique = [...new Set(perms)];
    AsyncStorage.setItem('Permissions', JSON.stringify(unique)).catch(() => {});
    return unique;
  }, [user, attendanceType]);

  const hasPermission = useCallback(
    perm => mobilePermissions.includes(perm),
    [mobilePermissions]
  );

  const screenConfigs = useMemo(
    () => [
      { name: 'Dashboard', component: Dashboard, permission: 'Dashboard', icon: LayoutGrid },
      { name: 'CheckIn', component: CheckIn, permission: 'Check In', icon: LogIn },
      { name: 'CheckOut', component: CheckOut, permission: 'Check Out', icon: LogOut },
      { name: 'Employees', component: EmployeesScreen, permission: 'View Employees', icon: Users },
      { name: 'History', component: HistoryScreen, permission: 'History', icon: History },
    ],
    []
  );

  const allowedScreens = useMemo(
    () => screenConfigs.filter(s => hasPermission(s.permission)),
    [screenConfigs, hasPermission]
  );

  const initialRoute = useMemo(
    () =>
      allowedScreens.find(s => s.name === 'Dashboard')?.name ||
      allowedScreens[0]?.name ||
      'Dashboard',
    [allowedScreens]
  );

  const commonProps = useMemo(
    () => ({
      currentLocation,
      nearyByProject,
      attendanceType,
      user,
      locationLoading,
      projectsLoading,
      isConnected,
      permissionStatus,
      gpsEnabled,
      isTrackingLocation,
      locationUpdateCount,
      locationError,
      refreshLocation: refreshLocationAndTracking,
    }),
    [
      currentLocation,
      nearyByProject,
      attendanceType,
      user,
      locationLoading,
      projectsLoading,
      isConnected,
      permissionStatus,
      gpsEnabled,
      isTrackingLocation,
      locationUpdateCount,
      locationError,
    ]
  );

  const ScreenWrapper = useCallback(({ children, screenName }) => {
    useEffect(() => {}, [screenName]);
    return children;
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  if (locationLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingMessage}>Getting your location...</Text>
        <Text style={styles.subMessage}>
          {permissionStatus === 'unknown' && 'Requesting permission...'}
          {permissionStatus === 'granted' && !gpsEnabled && 'GPS disabled'}
          {permissionStatus === 'granted' && gpsEnabled && 'Locating...'}
          {permissionStatus === 'denied' && 'Permission required'}
        </Text>
      </View>
    );
  }

  if (allowedScreens.length === 0) {
    return (
      <View style={styles.noAccessContainer}>
        <AlertTriangle size={48} color={Colors.error} />
        <Text style={styles.noAccessTitle}>No Access Permissions</Text>
        <Text style={styles.noAccessMessage}>
          You don't have the required permissions to access this application.{'\n'}
          Please contact your administrator.
        </Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={20} color="white" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const cfg = allowedScreens.find(s => s.name === route.name);
        return {
          tabBarActiveTintColor: Colors.secondary,
          tabBarInactiveTintColor: Colors.textLight,
          tabBarStyle: {
            backgroundColor: Colors.primary,
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom,
          },
          tabBarIcon: ({ color }) => {
            const Icon = cfg?.icon || LayoutGrid;
            return <Icon size={24} color={color} />;
          },
          headerShown: false,
        };
      }}
      initialRouteName={initialRoute}
    >
      {allowedScreens.map(screen => (
        <Tab.Screen
          key={screen.name}
          name={screen.name}
          children={props => (
            <ScreenWrapper screenName={screen.name}>
              <screen.component {...props} {...commonProps} />
            </ScreenWrapper>
          )}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = {
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  subMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 40,
  },
  noAccessTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 20,
  },
  noAccessMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error || '#ef4444',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 40,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
};