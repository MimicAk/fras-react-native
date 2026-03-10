import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '../constants/colors';
import EnrollEmployeeTab from '../components/EnrollEmployeeTab';
import EnrolledEmployeeTab from '../components/EnrolledEmployeeTab';
import { useAuth } from '../AuthContext';

// Standardize constants outside the component to prevent re-renders
const TABS = {
  ENROLL: 'enroll',
  ENROLLED: 'enrolled',
};

export default function EmployeesScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState(TABS.ENROLL);
  const { user } = useAuth();

  const handleTabChange = useCallback(tab => {
    setActiveTab(tab);
  }, []);

  // Memoize content to prevent heavy sub-tabs from re-rendering
  // unless the activeTab or user data actually changes.
  const renderContent = useMemo(() => {
    switch (activeTab) {
      case TABS.ENROLL:
        return (
          <EnrollEmployeeTab
            navigation={navigation}
            onEnrollmentSuccess={() => setActiveTab(TABS.ENROLLED)}
          />
        );
      case TABS.ENROLLED:
        return (
          <EnrolledEmployeeTab
            userDetails={user}
            navigation={navigation}
            filterOption={true}
          />
        );
      default:
        return null;
    }
  }, [activeTab, navigation, user]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.container}>
        {/* Pass TABS object to TabBar to keep logic encapsulated */}
        <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

        <View style={styles.contentContainer}>{renderContent}</View>
      </View>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────
// UI Components (Internal)
// ────────────────────────────────────────────────

const TabBar = ({ activeTab, onTabChange }) => (
  <View style={styles.tabBar}>
    <TabItem
      label="Search & Enroll"
      isActive={activeTab === TABS.ENROLL}
      onPress={() => onTabChange(TABS.ENROLL)}
    />
    <TabItem
      label="Enrolled Employees"
      isActive={activeTab === TABS.ENROLLED}
      onPress={() => onTabChange(TABS.ENROLLED)}
    />
  </View>
);

const TabItem = React.memo(({ label, isActive, onPress }) => (
  <TouchableOpacity
    style={styles.tabItem}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
      {label}
    </Text>
    {/* Visual Indicator: Fixed bar at bottom instead of shifting borders */}
    <View style={[styles.indicator, isActive && styles.indicatorActive]} />
  </TouchableOpacity>
));

// ────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff', // Match status bar
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    elevation: 2, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    zIndex: 10,
  },
  tabItem: {
    flex: 1,
    paddingTop: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    height: 3,
    width: '60%', // Cleaner look than 100% width
    backgroundColor: 'transparent',
    marginTop: 12,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  indicatorActive: {
    backgroundColor: Colors.secondary || '#00a884',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  tabLabelActive: {
    color: Colors.secondary || '#00a884',
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
  },
});
