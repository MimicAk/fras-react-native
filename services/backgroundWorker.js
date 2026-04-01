import BackgroundFetch from 'react-native-background-fetch';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import {
  runBackgroundSync,
  runVectorPullSync,
  syncVectorBackground,
} from './backgroundSync.service';
// import { startLoggerEngine } from './logger.service';
import { useAuth } from '../AuthContext';

/* ======================================================
   TRUE BACKGROUND SYNC (Runs when app is minimized/closed)
====================================================== */
export const initBackgroundFetch = async userToken => {
  try {
    const status = await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15, // The OS minimum is 15 minutes
        stopOnTerminate: false, // Keep running if the user swipes the app away
        enableHeadless: true, // Required for Android closed-state sync
        startOnBoot: true, // Restart after phone reboot
      },
      async taskId => {
        console.log('[BackgroundFetch] Task triggered: ', taskId);

        // Execute your sync logic here
        await runBackgroundSync(userToken);

        // MUST call finish() so the OS doesn't kill your app
        BackgroundFetch.finish(taskId);
      },
      taskId => {
        console.warn('[BackgroundFetch] Task timed out: ', taskId);
        BackgroundFetch.finish(taskId);
      },
    );
    console.log('[BackgroundFetch] Configured with status: ', status);
  } catch (err) {
    console.error('[BackgroundFetch] Failed to configure: ', err);
  }
};

/* ======================================================
   FOREGROUND SYNC (Runs when app is open & active)
====================================================== */
let foregroundInterval = null;

export const startForegroundSyncService = (userToken, user) => {
  // Sync immediately when internet returns
  NetInfo.addEventListener(state => {
    if (state.isConnected) {
      runBackgroundSync(userToken);
      startVectorPullBackground(userToken, user?.guid);
    }
  });

  // Sync immediately when app is brought back to the screen
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      runBackgroundSync(userToken);
      syncVectorBackground(userToken, user?.guid);
      // startVectorPullBackground(userToken, user?.guid);
      // startLoggerEngine(userToken);
    }
  });

  // userDetails?.guid
  // Fast interval syncing ONLY while the app is open
  if (!foregroundInterval) {
    foregroundInterval = setInterval(() => {
      runBackgroundSync(userToken);
      syncVectorBackground(userToken, user?.guid);
    }, 1 * 60 * 1000);

    startVectorPullBackground(userToken, user?.guid);
  }
};

/* ======================================================
   VECTOR PULL BACKGROUND RUNNER (6 HOURS)
====================================================== */

let vectorPullInterval = null;

export const startVectorPullBackground = (userToken, userGuid) => {
  console.log('🚀 Vector Pull Background Started');

  // Run once immediately
  runVectorPullSync(userToken, userGuid);

  if (vectorPullInterval) return;
  // Run every 6 hours
  if (!vectorPullInterval) {
    vectorPullInterval = setInterval(() => {
      runVectorPullSync(userToken, userGuid);
    }, 20 * 60 * 1000); 
  }
};
