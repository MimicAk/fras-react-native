import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const StatsCards = ({ stats }) => (
  <View style={styles.statsContainer}>
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>Check-Ins</Text>
      <Text style={styles.statsValue}>{stats.checkIns}</Text>
    </View>
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>Check-Outs</Text>
      <Text style={styles.statsValue}>{stats.checkOuts}</Text>
    </View>
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>Synced</Text>
      <Text style={styles.statsValue}>{stats.synced}</Text>
    </View>
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>Not Synced</Text>
      <Text style={styles.statsValue}>{stats.notSynced}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 15,
    gap: 10,
  },
  statsCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 5,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default StatsCards;