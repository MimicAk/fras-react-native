// components/CustomAlert.js

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../constants/colors';

export const CustomAlert = ({
  visible,
  title,
  message,
  onClose, // Triggered on Android hardware back button
  onConfirm,
  confirmText = 'Got it',
  onCancel,
  cancelText = 'Cancel',
  showCancel = false,
}) => {
  // Handlers to gracefully execute callbacks and fallback to onClose if none provided
  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    else if (onClose) onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.alertCard}>
          {/* Warning Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>!</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Button Row */}
          <View style={styles.buttonContainer}>
            {showCancel && (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                showCancel && styles.halfButton, // Shrink to fit side-by-side if cancel is shown
              ]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12, // Spacing between buttons
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfButton: {
    flex: 1, // Takes up equal space when side-by-side
  },
  confirmButton: {
    backgroundColor: colors.primary || '#3B82F6',
    width: '100%', // Full width by default, overridden by halfButton if showCancel is true
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9', // Light gray for secondary action
    flex: 1,
  },
  cancelButtonText: {
    color: '#475569', // Dark gray text
    fontSize: 16,
    fontWeight: '600',
  },
});
