// components/FaceConfirmationPopup.js

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import colors from './../../constants/colors';

const FaceConfirmationPopup = ({
  visible,
  employee,
  onConfirm,
  onCancel,
  checkType = 'in',
}) => {
  if (!visible || !employee) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.title}>
          Confirm Check-{checkType === 'in' ? 'In' : 'Out'}
        </Text>

        <Text style={styles.name}>{employee.name}</Text>
        <Text style={styles.staffId}>ID: {employee.staffid}</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.confirmBtn]}
            onPress={onConfirm}
          >
            <Text style={styles.buttonText}>✓ Confirm</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelBtn]}
            onPress={onCancel}
          >
            <Text style={styles.buttonText}>✗ Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default FaceConfirmationPopup;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 25,
    width: '85%',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
  },
  staffId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
    minWidth: 120,
  },
  confirmBtn: {
    backgroundColor: '#16a34a',
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
});
