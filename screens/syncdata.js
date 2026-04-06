// screens/SyncData.js

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { AnimatedCircularProgress } from 'react-native-circular-progress';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../AuthContext';
import {
  pullVectorsService,
  pushVectorsService,
} from '../services/sync.service';
import { CustomAlert } from '../components/CustomAlert';

const { width } = Dimensions.get('window');

// Zoho-inspired enterprise color palette
const theme = {
  primary: '#0059C8', // Deep, trustworthy SaaS blue
  primaryLight: '#EBF4FF',
  success: '#10B981',
  successLight: '#D1FAE5',
  background: '#F8FAFC', // Slate 50 - clean, crisp off-white
  textMain: '#0F172A',
  textSub: '#64748B',
  border: '#E2E8F0',
  error: '#EF4444',
  errorLight: '#FEE2E2',
};

export default function SyncData({ navigation }) {
  const { user } = useAuth();

  // Core States
  const [isConnected, setIsConnected] = useState(true);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    confirmText: 'Got it',
  });

  // Network Listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  // Prevent going back while syncing
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', e => {
      if (!isSyncing) return;

      e.preventDefault();
      setAlertConfig({
        visible: true,
        title: 'Sync in Progress',
        message:
          'Please wait until the synchronization is complete before leaving this screen.',
        showCancel: false,
        confirmText: 'Okay',
        onConfirm: closeAlert,
      });
    });
    return unsubscribe;
  }, [navigation, isSyncing]);

  const closeAlert = () =>
    setAlertConfig(prev => ({ ...prev, visible: false }));

  const startSync = async () => {
    if (!isConnected) {
      setAlertConfig({
        visible: true,
        title: 'Offline Mode',
        message: 'Please connect to the internet to synchronize your data.',
        showCancel: false,
        confirmText: 'Okay',
        onConfirm: closeAlert,
      });
      return;
    }

    try {
      activateKeepAwake();
      setIsSyncing(true);
      setCompleted(false);
      setProgress(0);
      setTotal(0);

      // Push local data
      await pushVectorsService({ token: user?.token });
      await AsyncStorage.setItem('lastsyncdate', '2025-06-01');

      // Pull remote data
      await pullVectorsService({
        token: user?.token,
        userGuid: user?.guid,
        onProgress: (current, totalCount) => {
          setProgress(current);
          setTotal(totalCount);
        },
      });

      setCompleted(true);
    } catch (error) {
      setAlertConfig({
        visible: true,
        title: 'Sync Failed',
        message:
          error.message ||
          'An unexpected error occurred during synchronization.',
        showCancel: true,
        confirmText: 'Try Again',
        cancelText: 'Cancel',
        onConfirm: () => {
          closeAlert();
          startSync();
        },
      });
    } finally {
      setIsSyncing(false);
      deactivateKeepAwake();
    }
  };

  const progressPercentage =
    total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <View style={styles.mainBackground}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Clean Enterprise Background Accents */}
      <View style={styles.bgRingTop} />
      <View style={styles.bgRingBottom} />

      <SafeAreaView style={styles.safeArea}>
        {/* HEADER SECTION */}
        <View style={styles.header}>
          <Text style={styles.brandTag}>DATA MANAGEMENT</Text>
          <Text style={styles.title}>
            {completed
              ? 'Sync Complete'
              : isSyncing
              ? 'Synchronizing'
              : 'Sync your data'}
          </Text>
          <Text style={styles.subtitle}>
            {completed
              ? 'Your workspace is fully up to date.'
              : 'Ensure your offline and online records are securely updated and aligned.'}
          </Text>
        </View>

        {/* CENTER VISUAL SECTION */}
        <View style={styles.centerStage}>
          {/* STATE 1: READY */}
          {!isSyncing && !completed && (
            <View style={styles.readyContainer}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconCloud}>☁️</Text>
              </View>
              {!isConnected && (
                <View style={styles.offlineBadge}>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlineText}>No Connection</Text>
                </View>
              )}
            </View>
          )}

          {/* STATE 2: SYNCING */}
          {isSyncing && (
            <AnimatedCircularProgress
              size={width * 0.65}
              width={10}
              fill={progressPercentage}
              tintColor={theme.primary}
              backgroundColor={theme.border}
              rotation={0}
              lineCap="round"
              duration={600}
            >
              {fill => (
                <View style={styles.progressCenter}>
                  <Text style={styles.progressPercentText}>
                    {Math.round(fill)}%
                  </Text>
                  <Text style={styles.progressFractionText}>
                    {progress} of {total || '-'} records
                  </Text>
                </View>
              )}
            </AnimatedCircularProgress>
          )}

          {/* STATE 3: COMPLETED */}
          {completed && (
            <View style={styles.successContainer}>
              <View style={styles.successCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            </View>
          )}
        </View>

        {/* BOTTOM ACTION SECTION */}
        <View style={styles.footer}>
          {!isSyncing && !completed && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !isConnected && styles.buttonDisabled,
              ]}
              activeOpacity={0.8}
              onPress={startSync}
              disabled={!isConnected}
            >
              <Text style={styles.primaryButtonText}>Start Sync</Text>
            </TouchableOpacity>
          )}

          {isSyncing && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.loadingText}>Processing securely...</Text>
            </View>
          )}

          {completed && (
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('LandingPage')}
            >
              <Text style={styles.secondaryButtonText}>Back to Dashboard</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        showCancel={alertConfig.showCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={closeAlert}
        onClose={closeAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainBackground: {
    flex: 1,
    backgroundColor: theme.background,
  },
  /* Crisp Geometric Background Elements */
  bgRingTop: {
    position: 'absolute',
    top: -width * 0.4,
    right: -width * 0.2,
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width,
    borderWidth: 1.5,
    borderColor: theme.primaryLight,
  },
  bgRingBottom: {
    position: 'absolute',
    bottom: -width * 0.3,
    left: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width,
    borderWidth: 1.5,
    borderColor: theme.primaryLight,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 30,
  },
  /* Header */
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  brandTag: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.primary,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.textMain,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.textSub,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  /* Center Stage */
  centerStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readyContainer: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  iconCloud: {
    fontSize: 60,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.errorLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 24,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.error,
    marginRight: 8,
  },
  offlineText: {
    color: theme.error,
    fontSize: 14,
    fontWeight: '600',
  },
  progressCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercentText: {
    fontSize: 48,
    fontWeight: '700',
    color: theme.textMain,
  },
  progressFractionText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.textSub,
    marginTop: 4,
  },
  successContainer: {
    alignItems: 'center',
  },
  successCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: theme.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  checkMark: {
    fontSize: 54,
    color: theme.success,
    fontWeight: '600',
  },
  /* Footer */
  footer: {
    minHeight: 60,
    justifyContent: 'flex-end',
  },
  primaryButton: {
    backgroundColor: theme.primary,
    paddingVertical: 18,
    borderRadius: 12, // Corporate SaaS rounded rectangle
    alignItems: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: theme.textSub,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.textMain,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  loadingText: {
    fontSize: 15,
    color: theme.textSub,
    marginLeft: 12,
    fontWeight: '500',
  },
});
