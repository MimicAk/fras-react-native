import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions
} from 'react-native';
import Colors from '../constants/colors';

const { width } = Dimensions.get('window');

const ActiveCheckinPopup = ({ 
  visible, 
  employee, 
  activeCheckin, 
  newProject,
  onConfirm, 
  onCancel 
}) => {
  
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerText}>⚠️ Active Check-in Detected</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.employeeName}>{employee?.name}</Text>
            <Text style={styles.employeeId}>ID: {employee?.staffid}</Text>

            <View style={styles.divider} />

            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>Currently checked in at:</Text>
              <Text style={styles.projectName}>{activeCheckin?.projectname || 'Unknown Project'}</Text>
              <Text style={styles.checkinTime}>
                Since: {formatDateTime(activeCheckin?.punchdate)}
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>Trying to check in at:</Text>
              <Text style={styles.projectName}>{newProject?.projectname || 'New Project'}</Text>
            </View>

            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                You need to checkout from the current project before checking in to a new project.
              </Text>
            </View>

            <Text style={styles.actionText}>
              Do you want to checkout from current project and checkin to new project?
            </Text>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.confirmButton]} 
              onPress={onConfirm}
            >
              <Text style={styles.confirmButtonText}>Proceed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.85,
    backgroundColor: 'white',
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    backgroundColor: Colors.warning || '#ff9800',
    padding: 15,
    alignItems: 'center',
  },
  headerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  body: {
    padding: 20,
  },
  employeeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  employeeId: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 15,
  },
  infoSection: {
    marginBottom: 15,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 5,
  },
  checkinTime: {
    fontSize: 13,
    color: '#888',
  },
  warningBox: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginVertical: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningText: {
    fontSize: 14,
    color: '#e65100',
    lineHeight: 20,
  },
  actionText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  confirmButton: {
    backgroundColor: Colors.secondary,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ActiveCheckinPopup;