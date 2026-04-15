import { Bugfender, LogLevel } from '@bugfender/rn-bugfender';

class Logger {
  static initialized = false;

  // ✅ Initialize Bugfender
  static init() {
    if (this.initialized) return;

    Bugfender.init({
      appKey: 'vwVh0gCQIK3Gyby3wJ9xYU2yNu0wSo4f',
      overrideConsoleMethods: true,
      printToConsole: true,
      registerErrorHandler: true,
      logUIEvents: true,
    });

    this.initialized = true;
  }

  // ✅ Basic Logs
  static log(message) {
    Bugfender.log(message);
  }

  static info(message) {
    Bugfender.info(message);
  }

  static warn(message) {
    Bugfender.warn(message);
  }

  static error(message) {
    Bugfender.error(message);
  }

  static fatal(message) {
    Bugfender.fatal(message);
  }

  static trace(message) {
    Bugfender.trace(message);
  }

  // ✅ Advanced Log
  static sendLog({ line, level = LogLevel.Debug, tag, method, file, text }) {
    Bugfender.sendLog({
      line,
      level,
      tag,
      method,
      file,
      text,
    });
  }

  // ✅ Issues
  static async sendIssue(title, message) {
    try {
      const url = await Bugfender.sendIssue(title, message);
      return url;
    } catch (e) {
      console.error('Bugfender Issue Error:', e);
    }
  }

  // ✅ Crash
  static async sendCrash(title, message) {
    try {
      const url = await Bugfender.sendCrash(title, message);
      return url;
    } catch (e) {
      console.error('Bugfender Crash Error:', e);
    }
  }

  // ✅ Feedback
  static async sendFeedback(title, message) {
    try {
      const url = await Bugfender.sendUserFeedback(title, message);
      return url;
    } catch (e) {
      console.error('Bugfender Feedback Error:', e);
    }
  }

  // ✅ Open Native Feedback UI
  static async openFeedbackUI() {
    try {
      const response = await Bugfender.getUserFeedback({
        title: 'Feedback',
        hint: 'Please send us your feedback',
        subjectPlaceholder: 'Reason',
        feedbackPlaceholder: 'Write your message',
        submitLabel: 'Send',
        closeLabel: 'Cancel',
      });

      return response;
    } catch (e) {
      console.error('Feedback UI Error:', e);
    }
  }

  // ✅ Device Info
  static setDeviceKey(key, value) {
    Bugfender.setDeviceKey(key, value);
  }

  static removeDeviceKey(key) {
    Bugfender.removeDeviceKey(key);
  }

  // ✅ URLs
  static async getDeviceURL() {
    return await Bugfender.getDeviceURL();
  }

  static async getSessionURL() {
    return await Bugfender.getSessionURL();
  }

  // ✅ Force Sync
  static sync() {
    Bugfender.forceSendOnce();
  }

  static async setupDeviceInfo(userId = null) {
    try {
      const deviceName = await DeviceInfo.getDeviceName(); // e.g. "Ashok's Phone"
      const model = DeviceInfo.getModel(); // e.g. "SM-A505F"
      const brand = DeviceInfo.getBrand(); // e.g. "Samsung"
      const uniqueId = await DeviceInfo.getUniqueId();
      const battery = await DeviceInfo.getBatteryLevel();
      const systemVersion = DeviceInfo.getSystemVersion();

      // 🔥 Combine readable name + model
      const fullDeviceName = `${deviceName} (${brand} ${model})`;

      // ✅ Set in Bugfender
      Bugfender.setDeviceKey('device_name', fullDeviceName);
      Bugfender.setDeviceKey('device_model', model);
      Bugfender.setDeviceKey('device_brand', brand);
      Bugfender.setDeviceKey('device_id', uniqueId);

      Bugfender.setDeviceKey('battery', `${Math.round(battery * 100)}%`);
      Bugfender.setDeviceKey('os_version', systemVersion);

      if (userId) {
        Bugfender.setDeviceKey('user_id', userId);
      }

      // 💡 Optional: also override Bugfender device name
      Bugfender.setDeviceString('device_name', fullDeviceName);
    } catch (e) {
      console.error('Device Info Setup Error:', e);
    }
  }
}

export default Logger;
