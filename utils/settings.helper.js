import AsyncStorage from '@react-native-async-storage/async-storage';

// ────────────────────────────────────────────────
//  SCALABLE SETTINGS CONFIGURATION
// ────────────────────────────────────────────────
export const SETTINGS_CONFIG = [
  {
    key: 'FACE_MATCH_THRESHOLD',
    label: 'Face Match Threshold',
    group: 'Recognition, Matching & Enrollment',
    icon: 'ScanFace',
    default: 0.6,
    type: 'float',
    inputType: 'slider',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    description: 'Base threshold for matching faces.',
  },
  {
    key: 'RECOGNITION_THRESHOLD',
    label: 'Recognition Threshold',
    group: 'Recognition, Matching & Enrollment',
    icon: 'UserCheck',
    default: 0.55,
    type: 'float',
    inputType: 'slider',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    description: 'Used for daily check-in & check-out.',
  },
  {
    key: 'ENROLLMENT_DUPLICATE_THRESHOLD',
    label: 'Duplicate Threshold',
    group: 'Recognition, Matching & Enrollment',
    icon: 'Users',
    default: 0.75,
    type: 'float',
    inputType: 'slider',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    description: 'Prevents enrolling the same face twice.',
  },
  {
    key: 'TEMPLATE_UPDATE_THRESHOLD',
    label: 'Template Update',
    group: 'Recognition, Matching & Enrollment',
    icon: 'RefreshCcw',
    default: 0.6,
    type: 'float',
    inputType: 'slider',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    description: 'Threshold for successful check-in updates.',
  },
  {
    key: 'BATCH_SIZE',
    label: 'Matching Batch Size',
    group: 'Performance',
    icon: 'Cpu',
    default: 3500,
    type: 'int',
    inputType: 'dropdown',
    options: [
      { label: '1000 (Smooth UI, Slower Match)', value: 1000 },
      { label: '2000 (Balanced)', value: 2000 },
      { label: '3500 (Fast Match, Minor UI Lag)', value: 3500 },
      { label: '5000 (Max Speed, UI Blocking)', value: 5000 },
    ],
    description: 'Number of vectors processed per loop yield.',
  },
];

let settingsCache = {};

export const initializeSettings = async () => {
  try {
    const keys = SETTINGS_CONFIG.map(config => config.key);
    const storedValues = await AsyncStorage.multiGet(keys);

    storedValues.forEach(([key, value]) => {
      const config = SETTINGS_CONFIG.find(c => c.key === key);
      if (value !== null) {
        settingsCache[key] =
          config.type === 'float' ? parseFloat(value) : parseInt(value, 10);
      } else {
        settingsCache[key] = config.default;
      }
    });
    return settingsCache;
  } catch (error) {
    SETTINGS_CONFIG.forEach(config => {
      settingsCache[config.key] = config.default;
    });
    return settingsCache;
  }
};

export const getSetting = key => {
  if (settingsCache[key] !== undefined) return settingsCache[key];
  const config = SETTINGS_CONFIG.find(c => c.key === key);
  return config ? config.default : null;
};

export const saveSetting = async (key, value) => {
  try {
    const config = SETTINGS_CONFIG.find(c => c.key === key);
    if (!config) return false;

    let parsedValue =
      config.type === 'float' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsedValue)) return false;

    await AsyncStorage.setItem(key, String(parsedValue));
    settingsCache[key] = parsedValue;
    return true;
  } catch (error) {
    return false;
  }
};

export const getAllSettings = async () => {
  if (Object.keys(settingsCache).length === 0) await initializeSettings();
  return { ...settingsCache };
};
