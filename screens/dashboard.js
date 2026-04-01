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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
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
      const initialize = async () => {
        if (!user) return;
        setLoading(true);
        await Promise.all([loadDashboardData(), checkNeedsInitialSync()]);
        setLoading(false);
      };
      initialize();
    }, [user, loadDashboardData, checkNeedsInitialSync]),
  );

  const onRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot refresh while offline.');
      return;
    }
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const syncPercentage = useMemo(() => {
    if (overallStats.total <= 0) return 0;
    return Math.round((overallStats.synced / overallStats.total) * 100);
  }, [overallStats]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading workspace...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        name={user?.name ?? 'User'}
        onLogoutPress={() => {
          logout();
          navigation.navigate('Login');
        }}

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
          {nearyByProject.length > 1 && (
            <View style={styles.dropdownContainer}>
              <ProjectDropdown projectList={nearyByProject} />
            </View>
          )}

          <LocationCard
            location={
              nearyByProject[0]?.location_shotname ?? 'Detecting location...'
            }
            coordinates={
              nearyByProject[0]
                ? `${nearyByProject[0].latitude ?? '0.0'}, ${
                    nearyByProject[0].longitude ?? '0.0'
                  }`
                : '—'
            }
          />

          <View style={styles.spacing} />
          <TimeCard navigation={navigation} />

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
                <Text style={styles.progressPercent}>{syncPercentage}%</Text>
                <Text style={styles.progressStatus}>Completed</Text>
              </View>
              <View style={styles.progressBg}>
                <View
                  style={[styles.progressFill, { width: `${syncPercentage}%` }]}
                />
              </View>
            </View>
          </View>

          <View style={{ height: 60 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  contentPadding: { paddingHorizontal: 16 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
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
});
