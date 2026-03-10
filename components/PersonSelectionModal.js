import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { User, X } from 'lucide-react-native';
import colors from '../constants/colors';

const PersonSelectionModal = ({ visible, matches, onSelect, onCancel }) => {
  const renderPersonItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.personItem} 
      onPress={() => onSelect(item)}
    >
      <View style={styles.personInfo}>
        <User size={24} color={colors.primary} />
        <View style={styles.personDetails}>
          <Text style={styles.personName}>{item.name}</Text>
          <Text style={styles.personId}>ID: {item.staffid}</Text>
          <Text style={styles.matchScore}>Match: {(item.similarity * 100).toFixed(1)}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Person</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.modalSubtitle}>
            Multiple matches found. Please select the correct person:
          </Text>
          
          <FlatList
            data={matches}
            renderItem={renderPersonItem}
            keyExtractor={(item) => item.uuid}
            style={styles.personList}
            showsVerticalScrollIndicator={false}
          />
          
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 20,
    textAlign: 'center',
  },
  personList: {
    maxHeight: 300,
  },
  personItem: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  personInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  personDetails: {
    marginLeft: 15,
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  personId: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 2,
  },
  matchScore: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  cancelButton: {
    backgroundColor: colors.error,
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PersonSelectionModal;