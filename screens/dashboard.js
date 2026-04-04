// screens/DashboardScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Text,
  RefreshControl,
  Dimensions,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';

// Lucide Icons
import {
  Wifi,
  WifiOff,
  LogIn,
  LogOut,
  CheckCircle2,
  Clock,
  Cloud,
  RefreshCcw,
  Database,
  ArrowRight,
  TrendingUp,
} from 'lucide-react-native';

import Colors from '../constants/colors';
import { Header } from '../components/Header';
import { LocationCard } from '../components/LocationCard';
import { TimeCard } from '../components/TimeCard';
import { CustomAlert } from '../components/CustomAlert';
import { useAuth } from '../AuthContext';
import ProjectDropdown from '../components/ProjectDropdown';

import {
  getTodayStatsService,
  checkInitialSyncService,
  getOverallSyncStatsService,
} from '../services/dashboard.service';
import { config } from '../config/config';
import { getStaffImage } from '../database/staff.repository';
import { connectToDatabase } from '../database/connection';

const { width } = Dimensions.get('window');

const theme = {
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textMain: '#0F172A',
  textSub: '#64748B',
  border: '#E2E8F0',
};

const MetricCard = ({ label, value, type = 'default', IconComponent }) => {
  const getStyleConfig = () => {
    switch (type) {
      case 'success':
        return {
          bg: theme.successLight,
          iconBg: '#D1FAE5',
          color: theme.success,
        };
      case 'danger':
        return {
          bg: theme.dangerLight,
          iconBg: '#FEE2E2',
          color: theme.danger,
        };
      case 'primary':
        return {
          bg: theme.primaryLight,
          iconBg: '#DBEAFE',
          color: theme.primary,
        };
      default:
        return { bg: '#F8FAFC', iconBg: '#F1F5F9', color: theme.textSub };
    }
  };
  const cfg = getStyleConfig();

  return (
    <View style={[styles.metricContainer, { backgroundColor: cfg.bg }]}>
      <View style={styles.metricHeader}>
        <View style={[styles.iconWrapper, { backgroundColor: cfg.iconBg }]}>
          {IconComponent && (
            <IconComponent size={16} color={cfg.color} strokeWidth={2.5} />
          )}
        </View>
        <Text
          style={[
            styles.metricValue,
            { color: type === 'default' ? theme.textMain : cfg.color },
          ]}
        >
          {value}
        </Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
};

export default function DashboardScreen({ navigation, nearyByProject = [] }) {
  const { user, logout } = useAuth();

  // Stats States
  const [todayStats, setTodayStats] = useState({
    checkIns: 0,
    checkOuts: 0,
    synced: 0,
    notSynced: 0,
  });
  const [overallStats, setOverallStats] = useState({
    total: 0,
    synced: 0,
    notSynced: 0,
    totalCheckIns: 0,
    totalCheckOuts: 0,
  });

  // UI States
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [userImage, setUserImage] = useState(null);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    showCancel: false,
    confirmText: 'Got it',
    onConfirm: null,
  });

  const closeAlert = useCallback(
    () => setAlertConfig(prev => ({ ...prev, visible: false })),
    [],
  );

  // Sync Network Listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state =>
      setIsOnline(state.isConnected ?? true),
    );
    return unsubscribe;
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoadError(null);
      const [today, overall] = await Promise.all([
        getTodayStatsService(),
        getOverallSyncStatsService(),
      ]);
      setTodayStats(
        today ?? { checkIns: 0, checkOuts: 0, synced: 0, notSynced: 0 },
      );
      setOverallStats(
        overall ?? {
          total: 0,
          synced: 0,
          notSynced: 0,
          totalCheckIns: 0,
          totalCheckOuts: 0,
        },
      );
    } catch (err) {
      setLoadError('Displaying offline data. Sync recommended.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const initialize = async () => {
        try {
          // 1. Database & User Image
          const db = await connectToDatabase();
          const img = await getStaffImage(db, user?.user?.emp_id);
          if (isActive) setUserImage(img);

          console.log(user?.user?.emp_id);
          console.log(img)

          // 2. Load Stats
          await loadDashboardData();

          // 3. Check Sync Requirement
          const syncCheck = await checkInitialSyncService();
          if (syncCheck?.needsSync && isActive) {
            setAlertConfig({
              visible: true,
              title: 'Sync Required',
              message: 'Data synchronization is needed to proceed.',
              confirmText: 'Sync Now',
              onConfirm: () => {
                closeAlert();
                navigation.navigate('SyncData');
              },
            });
          }

          if (isActive) setIsInitialLoad(false);
        } catch (error) {
          console.warn('Init Error:', error);
        }
      };

      initialize();
      return () => {
        isActive = false;
      };
    }, [user, loadDashboardData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleForceSync = () => {
    if (!isOnline) {
      setAlertConfig({
        visible: true,
        title: 'Offline',
        message: 'Internet connection is required for cloud sync.',
        confirmText: 'Okay',
        onConfirm: closeAlert,
      });
      return;
    }
    navigation.navigate('SyncData');
  };

  const syncPercentage = useMemo(() => {
    if (overallStats.total <= 0) return 0;
    return Math.round((overallStats.synced / overallStats.total) * 100);
  }, [overallStats]);

  const locationName =
    nearyByProject[0]?.location_shotname ?? 'Detecting location...';
  const coordinates = nearyByProject[0]
    ? `${nearyByProject[0].latitude ?? '0.0'}, ${
        nearyByProject[0].longitude ?? '0.0'
      }`
    : '—';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      <Header
        name={user?.name ?? 'User'}
        userImg={userImage} // Passes the base64 or uri from DB
        onLogoutPress={logout}
        navigation={navigation}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Connection Status Pill */}
        <View style={styles.connectionWrapper}>
          <View
            style={[
              styles.connectionPill,
              isOnline ? styles.pillOnline : styles.pillOffline,
            ]}
          >
            {isOnline ? (
              <Wifi size={12} color={theme.success} strokeWidth={3} />
            ) : (
              <WifiOff size={12} color={theme.textSub} strokeWidth={3} />
            )}
            <Text
              style={[
                styles.connectionText,
                isOnline ? styles.textOnline : styles.textOffline,
              ]}
            >
              {isOnline ? 'System Online' : 'Offline Mode'}
            </Text>
          </View>
        </View>

        {nearyByProject.length > 1 && (
          <View style={styles.dropdownContainer}>
            <ProjectDropdown projectList={nearyByProject} />
          </View>
        )}

        <LocationCard location={locationName} coordinates={coordinates} />
        <View style={styles.spacing} />
        <TimeCard navigation={navigation} />

        {isInitialLoad ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.loadingText}>Syncing Workspace...</Text>
          </View>
        ) : (
          <View style={styles.mainContent}>
            {/* Analytics Panel */}
            <View style={styles.modernCard}>
              <View style={styles.cardHeader}>
                <View style={styles.headerIconBg}>
                  <TrendingUp size={18} color={theme.primary} />
                </View>
                <Text style={styles.cardTitle}>Activity Summary</Text>
              </View>

              <Text style={styles.subSectionTitle}>TODAY</Text>
              <View style={styles.metricGrid}>
                <MetricCard
                  label="In"
                  value={todayStats.checkIns}
                  type="primary"
                  IconComponent={LogIn}
                />
                <MetricCard
                  label="Out"
                  value={todayStats.checkOuts}
                  IconComponent={LogOut}
                />
                <MetricCard
                  label="Synced"
                  value={todayStats.synced}
                  type="success"
                  IconComponent={CheckCircle2}
                />
                <MetricCard
                  label="Local"
                  value={todayStats.notSynced}
                  type={todayStats.notSynced > 0 ? 'danger' : 'default'}
                  IconComponent={Clock}
                />
              </View>

              <View style={styles.divider} />

              <Text style={styles.subSectionTitle}>LIFETIME TOTALS</Text>
              <View style={styles.metricGrid}>
                <MetricCard
                  label="Check-Ins"
                  value={overallStats.totalCheckIns}
                  IconComponent={LogIn}
                />
                <MetricCard
                  label="Check-Outs"
                  value={overallStats.totalCheckOuts}
                  IconComponent={LogOut}
                />
              </View>
            </View>

            {/* Sync Progress Panel */}
            <View style={styles.modernCard}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.headerIconBg,
                    { backgroundColor: theme.successLight },
                  ]}
                >
                  <Cloud size={18} color={theme.success} />
                </View>
                <Text style={styles.cardTitle}>Cloud Connectivity</Text>
              </View>

              <View style={styles.syncOverview}>
                <View style={styles.syncDataCol}>
                  <Text style={styles.syncDataValue}>{overallStats.total}</Text>
                  <Text style={styles.syncDataLabel}>Logs</Text>
                </View>
                <View style={styles.syncDataDivider} />
                <View style={styles.syncDataCol}>
                  <Text
                    style={[styles.syncDataValue, { color: theme.success }]}
                  >
                    {overallStats.synced}
                  </Text>
                  <Text style={styles.syncDataLabel}>Cloud</Text>
                </View>
                <View style={styles.syncDataDivider} />
                <View style={styles.syncDataCol}>
                  <Text style={[styles.syncDataValue, { color: theme.danger }]}>
                    {overallStats.notSynced}
                  </Text>
                  <Text style={styles.syncDataLabel}>Pending</Text>
                </View>
              </View>

              <View style={styles.progressBarContainer}>
                <View style={styles.progressTextRow}>
                  <Text style={styles.progressLabel}>Health Index</Text>
                  <Text style={styles.progressPercent}>{syncPercentage}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${syncPercentage}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Action Panel */}
        <View style={styles.actionPanel}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleForceSync}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonLeft}>
              <View style={styles.actionIconWrapper}>
                <RefreshCcw size={20} color={theme.primary} />
              </View>
              <View>
                <Text style={styles.actionButtonText}>Maintenance Sync</Text>
                <Text style={styles.actionButtonSub}>
                  Refresh and optimize workspace
                </Text>
              </View>
            </View>
            <ArrowRight size={18} color={theme.textSub} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        onConfirm={alertConfig.onConfirm}
        onClose={closeAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  spacing: { height: 16 },
  mainContent: { marginTop: 8 },
  dropdownContainer: { marginBottom: 16 },

  connectionWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillOnline: { backgroundColor: theme.successLight, borderColor: '#A7F3D0' },
  pillOffline: { backgroundColor: '#F1F5F9', borderColor: theme.border },
  connectionText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.2,
  },
  textOnline: { color: theme.success },
  textOffline: { color: theme.textSub },

  loaderContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: theme.textSub,
    fontWeight: '500',
    fontSize: 14,
  },

  modernCard: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    ...Platform.select({
      ios: {
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  headerIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: theme.textMain },

  subSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.textSub,
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 20 },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricContainer: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.01)',
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 12, color: theme.textSub, fontWeight: '600' },

  syncOverview: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  syncDataCol: { flex: 1, alignItems: 'center' },
  syncDataValue: { fontSize: 20, fontWeight: '800', color: theme.textMain },
  syncDataLabel: {
    fontSize: 10,
    color: theme.textSub,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  syncDataDivider: { width: 1, backgroundColor: theme.border },

  progressBarContainer: { width: '100%' },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { fontSize: 12, color: theme.textMain, fontWeight: '700' },
  progressPercent: { fontSize: 12, color: theme.primary, fontWeight: '800' },
  progressTrack: {
    height: 6,
    backgroundColor: theme.primaryLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: 3,
  },

  actionPanel: { marginTop: 4 },
  actionButton: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionButtonLeft: { flexDirection: 'row', alignItems: 'center' },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionButtonText: { fontSize: 15, fontWeight: '700', color: theme.textMain },
  actionButtonSub: {
    fontSize: 12,
    color: theme.textSub,
    marginTop: 2,
    fontWeight: '500',
  },
});
