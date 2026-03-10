import { Briefcase } from 'lucide-react-native';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../constants/colors';

const EmployeeCard = ({ item }) => (
  <View style={styles.employeeCard}>
    <View style={styles.employeeHeader}>
      <Text style={styles.employeeName}>{item.name}</Text>
      <Text style={styles.employeeId}>{item.employeeId}</Text>
    </View>
    <View style={styles.employeeDetails}>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Check-in</Text>
        <Text style={styles.detailValue}>{item.checkIn}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Check-out</Text>
        <Text style={styles.detailValue}>{item.checkOut}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Location</Text>
        <Text style={styles.detailValue}>{item.location}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Sync Status</Text>
        <Text style={[
          styles.detailValue,
          { color: item.syncStatus === 'Synced' ? '#4CAF50' : '#FF5722' }
        ]}>
          {item.syncStatus}
        </Text>
      </View>
      <View style={{backgroundColor:'#a5a5a5ff', height:1.5, width:'100%', marginBottom:1.5, marginTop:5}}></View>
      <View style={styles.projectRow}>
        <Briefcase size={20} color={colors.textSecondary} />
        <Text style={styles.projectLabel}> Project: </Text>
        <Text style={styles.projectValue}> {item.project}</Text>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  employeeCard: {
    backgroundColor: '#ffffff',
    marginBottom: 15,
    borderRadius: 8,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  employeeHeader: {
    marginBottom: 10,
  },
  employeeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  employeeId: {
    fontSize: 14,
    color: '#666',
  },
  employeeDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  projectLabel: {
    fontSize: 14,
    color: '#666',
  },
  projectValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});

export default EmployeeCard;