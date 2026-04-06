import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Funnel } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { useIsFocused } from '@react-navigation/native';

import FilterPopup from '../components/FilterPopup';
import EmployeeCard from '../components/HistoryEmplyCard';
import Colors from '../constants/colors';
import { config } from '../config/config';
import { useAuth } from '../AuthContext';
import { ApiExceptions } from '../utils/APIException';

import {
  getTodayStatsService,
  getOverallSyncStatsService,
} from '../services/dashboard.service';

const History = ({ navigation }) => {
  const { user } = useAuth();
  const isFocused = useIsFocused();

  const [employeeData, setEmployeeData] = useState([]);
  const [stats, setStats] = useState({
    checkIns: 0,
    checkOuts: 0,
    synced: 0,
    notSynced: 0,
  });

  const [showFilter, setShowFilter] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  const pageCount = useRef(1);
  const filterData = useRef({});

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isFocused) {
      initialize();
    }
  }, [isFocused]);

  const initialize = async () => {
    setIsLoading(true);
    await loadStats();
    pageCount.current = 1;
    await fetchHistory({});
    setIsLoading(false);
  };

  const loadStats = async () => {
    try {
      const todayStats = await getTodayStatsService();
      setStats(todayStats);
    } catch (error) {
      console.log('[History] Load stats error:', error);
    }
  };

  const fetchHistory = async (filters = {}) => {
    try {
      if (!user?.guid) return;

      const response = await fetch(`${config.Base_URL}/api/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          emp_id: user.guid,
          page: pageCount.current,
          ...filters,
        }),
      });

      if (!response.ok) {
        await ApiExceptions(response, navigation);
        return;
      }

      const result = await response.json();
      let key = 'all_data';
      if (filters?.dateOption === 'today') key = 'today';
      else if (filters?.dateOption === 'yesterday') key = 'yesterday';
      else if (filters?.dateOption === 'last7days') key = 'last_7days';
      else if (filters?.dateOption === 'last30days') key = 'last_30days';

      const apiData = result?.data?.[key]?.data || [];

      const transformed = apiData.map((item, index) => ({
        id: item.id || `${pageCount.current}-${index}`,
        name: item?.user?.name || 'Unknown',
        employeeId: item?.emp_id || item?.uuid || '—',
        checkIn: item?.checkin || item?.checkin_time || '—',
        checkOut: item?.checkout || item?.checkout_time || '—',
        location: item?.project?.location_shotname || item?.location || '—',
        project: item?.project?.projectname || 'No Project',
        syncStatus: 'Synced',
      }));

      if (pageCount.current === 1) {
        setEmployeeData(transformed);
      } else {
        setEmployeeData(prev => [...prev, ...transformed]);
      }

      if (apiData.length > 0) {
        pageCount.current += 1;
      }
    } catch (error) {
      console.error('History fetch error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    pageCount.current = 1;
    await loadStats();
    await fetchHistory(filterData.current);
  };

  const handleApplyFilters = filters => {
    filterData.current = filters;
    pageCount.current = 1;
    setShowFilter(false);
    setIsLoading(true);
    fetchHistory(filters).finally(() => setIsLoading(false));
  };

  const handleClearFilters = () => {
    filterData.current = {};
    pageCount.current = 1;
    setShowFilter(false);
    setIsLoading(true);
    fetchHistory({}).finally(() => setIsLoading(false));
  };

  /* ================= MINI STAT COMPONENT ================= */
  const MiniStat = ({ label, value, color }) => (
    <View style={styles.miniStatCard}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={[styles.miniStatValue, { color: color || '#1e293b' }]}>
        {value}
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <View style={styles.miniStatsRow}>
        <MiniStat label="In" value={stats.checkIns} color="#10b981" />
        <MiniStat label="Out" value={stats.checkOuts} color="#f59e0b" />
        <MiniStat label="Synced" value={stats.synced} color="#3b82f6" />
        {stats.notSynced > 0 && (
          <MiniStat label="Pending" value={stats.notSynced} color="#f43f5e" />
        )}
      </View>
      <Text style={styles.sectionLabel}>Attendance Logs</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>History</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#10b981' : '#cbd5e1' },
              ]}
            />
            <Text style={styles.statusText}>
              {isConnected ? 'Live' : 'Offline Mode'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowFilter(true)}
        >
          <Funnel size={20} color="#1e293b" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={employeeData}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <EmployeeCard item={item} />}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          onEndReached={() => {
            if (employeeData.length >= 10) fetchHistory(filterData.current);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No history records found</Text>
            </View>
          }
        />
      )}

      <FilterPopup
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        onApplyFilters={handleApplyFilters}
        handleClearFilters={handleClearFilters}
      />
    </SafeAreaView>
  );
};

export default History;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  iconButton: {
    padding: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  listContent: {
    paddingBottom: 40,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 15,
  },
  miniStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  miniStatCard: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    // Minimal shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  miniStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  miniStatValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    marginTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
});
