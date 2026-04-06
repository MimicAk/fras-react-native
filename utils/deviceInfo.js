import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export const getDeviceInfo = async () => {
  try {
    const netState = await NetInfo.fetch();
    
    return {
      model: await DeviceInfo.getModel(),
      os: Platform.OS,
      os_version: await DeviceInfo.getSystemVersion(),
      app_version: await DeviceInfo.getVersion(),
      battery_level: await DeviceInfo.getBatteryLevel().catch(() => 0),
      charging: await DeviceInfo.isBatteryCharging().catch(() => false),
      ram_total_mb: Math.round(await DeviceInfo.getTotalMemory() / (1024 * 1024)),
      ram_used_mb: null, // Will be calculated if needed
      ram_free_mb: null, // Will be calculated if needed
      network: netState.isConnected ? (netState.isInternetReachable ? 'online' : 'offline') : 'offline'
    };
  } catch (error) {
    console.error("Error getting device info:", error);
    return {
      model: 'unknown',
      os: Platform.OS,
      os_version: 'unknown',
      app_version: 'unknown',
      battery_level: 0,
      charging: false,
      ram_total_mb: 0,
      ram_used_mb: 0,
      ram_free_mb: 0,
      network: 'unknown'
    };
  }
};