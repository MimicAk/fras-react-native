// screens/DashboardScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Alert,
  Text,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';

import Colors from '../constants/colors';
import { Header } from '../components/Header';
import { LocationCard } from '../components/LocationCard';
import { TimeCard } from '../components/TimeCard';
import { StatCard } from '../components/StatCard';
import { useAuth } from '../AuthContext';
import ProjectDropdown from '../components/ProjectDropdown';

import {
  getTodayStatsService,
  checkInitialSyncService,
  getOverallSyncStatsService,
} from '../services/dashboard.service';
import { config } from '../config/config';

const { width } = Dimensions.get('window');

// Simple Icon Component for the Sync Card
const SyncIcon = ({ color }) => (
  <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
    <View style={[styles.iconInner, { borderColor: color }]} />
  </View>
);

export default function DashboardScreen({
  navigation,
  nearyByProject = [],
  currentLocation,
}) {
  const { user, logout } = useAuth();

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

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadError, setLoadError] = useState(null);


  // FOR API TESTING
  // useEffect(() => {
  //   const fetchVectors = async () => {
  //     try {
  //       const token = user?.token;
  //       const userGuid = user?.guid;
  //       const lastSyncDate = user?.lastSyncDate || '2025-06-01';
  //       const length = 20;
  //       const page = 1;

  //       const response = await fetch(`${config.Base_URL}/api/getallvectors`, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${token}`,
  //         },
  //         body: JSON.stringify({
  //           update_date: lastSyncDate,
  //           createdby: userGuid,
  //           length,
  //           page,
  //         }),
  //       });

  //       if (!response.ok) {
  //         const errorText = await response.text();
  //         throw new Error(`Vector fetch failed: ${errorText}`);
  //       }

  //       const json = await response.json();
  //       const data = json?.data?.data || [];
  //       const totalCount = json?.data?.total_count || 0;

  //       console.log('Fetched vectors:', data);
  //       console.log('Total count:', totalCount);
  //     } catch (err) {
  //       console.warn('Vector fetch error:', err);
  //     }
  //   };

  //   fetchVectors();
  // }, [user]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
    return unsubscribe;
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoadError(null);
      // Fetch stats concurrently
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
      console.warn('[Dashboard] Load failed:', err);
      setLoadError('Failed to load dashboard data. Pull to retry.');
    }
  }, []);

  const checkNeedsInitialSync = useCallback(async () => {
    try {
      const result = await checkInitialSyncService();
      if (result?.needsSync) {
        Alert.alert(
          'Initial Sync Required',
          'Please sync your data to continue',
          [
            {
              text: 'Sync Now',
              onPress: () => navigation.navigate('SyncData'),
            },
          ],
          { cancelable: false },
        );
      }
    } catch (err) {
      console.warn('[Dashboard] Initial sync check failed:', err);
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      if (!user) return;

      const initialize = async () => {
        // 1. Start fetching stats IMMEDIATELY (Do not wait for transitions)
        await loadDashboardData();

        // 2. Clear loader the exact millisecond stats arrive
        if (isActive) {
          setIsInitialLoad(false);
        }
      };

      initialize();

      // 3. Fire the background sync check completely separately
      // so it never blocks the UI from showing the stats.
      checkNeedsInitialSync();

      return () => {
        isActive = false; // Prevent memory leaks if user navigates away fast
      };
    }, [user, loadDashboardData, checkNeedsInitialSync]),
  );

  const onRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot refresh while offline.');
      return;
    }
    setRefreshing(true);
    await loadDashboardData(); // Only reload data on pull-to-refresh, don't trigger loader overlay
    setRefreshing(false);
  };

  const handleLogout = useCallback(() => {
    logout();
    navigation.navigate('Login');
  }, [logout, navigation]);

  const syncPercentage = useMemo(() => {
    if (overallStats.total <= 0) return 0;
    return Math.round((overallStats.synced / overallStats.total) * 100);
  }, [overallStats]);

  const locationName = useMemo(() => {
    return nearyByProject[0]?.location_shotname ?? 'Detecting location...';
  }, [nearyByProject]);

  const coordinates = useMemo(() => {
    const project = nearyByProject[0];
    return project
      ? `${project.latitude ?? '0.0'}, ${project.longitude ?? '0.0'}`
      : '—';
  }, [nearyByProject]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        name={user?.name ?? 'User'}
        onLogoutPress={handleLogout}
        navigation={navigation}
      />

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>OFFLINE MODE • DATA LOCAL</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {loadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        )}

        <View style={styles.contentPadding}>
          {/* Top layout renders instantly from local memory */}
          {nearyByProject.length > 1 && (
            <View style={styles.dropdownContainer}>
              <ProjectDropdown projectList={nearyByProject} />
            </View>
          )}

          <LocationCard location={locationName} coordinates={coordinates} />

          <View style={styles.spacing} />
          <TimeCard navigation={navigation} />

          {/* Bottom layout shows a clean loader until APIs return */}
          {isInitialLoad ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading workspace...</Text>
            </View>
          ) : (
            <View>
              {/* Today Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Today's Summary</Text>
                <View style={styles.titleLine} />
              </View>

              <View style={styles.statsGridRow}>
                <StatCard title="Check-Ins" value={todayStats.checkIns} />
                <StatCard title="Check-Outs" value={todayStats.checkOuts} />
              </View>

              <View style={styles.statsGridRow}>
                <StatCard title="Synced" value={todayStats.synced} />
                {todayStats.notSynced > 0 && (
                  <StatCard
                    title="Pending"
                    value={todayStats.notSynced}
                    style={styles.pendingCard}
                  />
                )}
              </View>

              {/* Lifetime Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Lifetime Analytics</Text>
                <View style={styles.titleLine} />
              </View>

              <View style={styles.statsGridRow}>
                <StatCard
                  title="Total In"
                  value={overallStats.totalCheckIns}
                  style={styles.lifetimeIn}
                />
                <StatCard
                  title="Total Out"
                  value={overallStats.totalCheckOuts}
                  style={styles.lifetimeOut}
                />
              </View>

              {/* Sync Status Integrated Card */}
              <View style={styles.syncCard}>
                <View style={styles.syncHeader}>
                  <View>
                    <Text style={styles.syncCardTitle}>Cloud Sync</Text>
                    <Text style={styles.syncSubtitle}>
                      {isOnline ? 'System Online' : 'Awaiting Connection'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.onlineDot,
                      { backgroundColor: isOnline ? '#10b981' : '#94a3b8' },
                    ]}
                  />
                </View>

                <View style={styles.syncMetrics}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{overallStats.total}</Text>
                    <Text style={styles.metricLabel}>Total Logs</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricValue, { color: '#10b981' }]}>
                      {overallStats.synced}
                    </Text>
                    <Text style={styles.metricLabel}>Synced</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricValue, { color: '#f43f5e' }]}>
                      {overallStats.notSynced}
                    </Text>
                    <Text style={styles.metricLabel}>Pending</Text>
                  </View>
                </View>

                <View style={styles.progressSection}>
                  <View style={styles.progressInfo}>
                    <Text style={styles.progressPercent}>
                      {syncPercentage}%
                    </Text>
                    <Text style={styles.progressStatus}>Completed</Text>
                  </View>
                  <View style={styles.progressBg}>
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

          <View style={{ height: 60 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  contentPadding: { paddingHorizontal: 16 },
  loaderContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: { marginBottom: 12 },
  loadingText: { marginTop: 12, color: '#64748B', fontWeight: '500' },
  scroll: { flex: 1 },
  spacing: { height: 12 },

  offlineBanner: {
    backgroundColor: '#0F172A',
    paddingVertical: 6,
    alignItems: 'center',
  },
  offlineText: {
    color: '#F1F5F9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  errorBanner: {
    backgroundColor: '#FEE2E2',
    margin: 16,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: { color: '#B91C1C', fontSize: 13, textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 10,
  },
  titleLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },

  statsGridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  pendingCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#F43F5E',
  },
  lifetimeIn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
    borderWidth: 1,
  },
  lifetimeOut: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
    borderWidth: 1,
  },

  syncCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  syncCardTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  syncSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },

  syncMetrics: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
  },
  metricItem: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 20, fontWeight: '800', color: '#334155' },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
  },

  progressSection: { marginTop: 20 },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  progressPercent: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
  progressStatus: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  progressBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary || '#6366F1',
    borderRadius: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
});
