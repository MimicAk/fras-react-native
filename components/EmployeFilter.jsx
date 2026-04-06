import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

const EmployeeFilterPopup = ({
  visible,
  onClose,
  onApplyFilters,
  // Dynamic data from API
  entityOptions = [],
  classificationOptions = []
}) => {
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedClassification, setSelectedClassification] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const handleApplyFilters = () => {
    const filters = {
      employeeSearch,
      classification: selectedClassification,
      entity: selectedEntity,
      // category: selectedCategory,
    };

    if (onApplyFilters) {
      onApplyFilters(filters);
    }

    if (onClose) {
      onClose();
    }
  };

  const handleResetFilters = () => {
    setEmployeeSearch('');
    setSelectedClassification('');
    setSelectedEntity('');
    setSelectedCategory('');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <SafeAreaView style={styles.safeArea}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Advanced Filter</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Search by Name or ID */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Search by ID or Name
                </Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Enter ID or Name"
                  value={employeeSearch}
                  onChangeText={setEmployeeSearch}
                  placeholderTextColor="#999"
                />
              </View>

              {/* Entity Picker */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Entity</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedEntity}
                    onValueChange={(itemValue) => setSelectedEntity(itemValue)}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select Entity" value=""  style={styles?.pickerItemColor} />
                    {entityOptions.map((item) => (
                      <Picker.Item
                        key={item.value}
                        label={item.label}
                        value={item.value}
                         style={styles?.pickerItemColor}
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Classification Picker */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Classification</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedClassification}
                    onValueChange={(itemValue) => setSelectedClassification(itemValue)}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select Classification" value="" 
                    style={styles?.pickerItemColor}/>
                    {classificationOptions.map((item) => (
                      <Picker.Item
                        style={styles?.pickerItemColor}
                        key={item.value}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Category Picker (Optional) */}
              {/* <View style={styles.section}>
                <Text style={styles.sectionTitle}>Category</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedCategory}
                    onValueChange={(itemValue) => setSelectedCategory(itemValue)}
                    style={styles.picker}
                  >
                     <Picker.Item label="Select Category" value="" color="#999" />
                    {categoryOptions.map((item) => (
                      <Picker.Item
                        key={item.value}
                        label={item.label}
                        value={item.value}
                        color="#333"
                      />
                    ))}
                </View>
              </View> */}

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={handleApplyFilters}
                >
                  <Text style={styles.applyButtonText}>Apply Filter</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={handleResetFilters}
                >
                  <Text style={styles.resetButtonText}>Reset Filters</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  safeArea: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  section: {
    marginVertical: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  requiredAsterisk: {
    color: '#ff0000',
    fontSize: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
  },
  picker: {
    height: 50,
  },
  pickerItemColor:{
     backgroundColor: 'white', 
     color: 'black',
     fontSize:14
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  applyButton: {
    backgroundColor: '#1e3a8a',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  applyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1e3a8a',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  resetButtonText: {
    color: '#1e3a8a',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default EmployeeFilterPopup;