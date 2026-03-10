import React, { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, SafeAreaView, ScrollView, StyleSheet
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

const FilterPopup = ({ visible, onClose, onApplyFilters, handleClearFilters}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDateOption, setSelectedDateOption] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');

  const dateOptions = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7days' },
    { label: 'Last 30 Days', value: 'last30days' },
  ];

  const projects = [
    'All Projects',
    'Marina Tower Development',
    'Shopping Mall Construction',
    'Residential Complex',
    'Office Building',
  ];

  const locations = [
    'All Locations',
    'Dubai Marina',
    'Downtown Dubai',
    'Business Bay',
    'Palm Jumeirah',
  ];

  const handleDateOptionPress = (option) => {
    setSelectedDateOption(option);
    setSelectedDate(new Date())

    
  };

  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
    setSelectedDateOption("custom")
  };

  const handleApplyFilters = () => {



    let extra ={};
    const idPattern = /^[A-Z]{3}\d{4}$/i; // e.g., TAS0001
    const namePattern = /^[a-zA-Z\s]+$/;  // Only letters and spaces

     if (employeeSearch) {
      const searchValue = employeeSearch.trim();

      if (idPattern.test(searchValue)) {
        extra = {empid:searchValue};
      } else if (namePattern.test(searchValue)) {
        extra = {name:searchValue};
      } 
    }


    const filters = {
      dateOption: selectedDateOption,
      date: selectedDate,
      ...extra,
    };
    
    // Call the callback if it exists
    if (onApplyFilters) {
      onApplyFilters(filters);
    }
    
    // Close the modal if onClose exists
    if (onClose) {
      onClose();
    }
  };

  const formatDate = (date) => {

    if(selectedDateOption != "custom" || date=="")
      return
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };


  function handleClearFiltersLocal(){
    setSelectedDateOption("custom");
    setEmployeeSearch("");
    handleClearFilters();
    setSelectedDate("");
  }
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
                <Text style={styles.headerTitle}>Filter Options</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Date</Text>
                <View style={styles.dateOptionsContainer}>
                  {dateOptions.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dateOptionButton,
                        selectedDateOption === option.value && styles.selectedDateOption
                      ]}
                      onPress={() => handleDateOptionPress(option.value)}
                    >
                      <Text style={[
                        styles.dateOptionText,
                        selectedDateOption === option.value && styles.selectedDateOptionText
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={styles.datePickerText}>
                    {formatDate(selectedDate) ? formatDate(selectedDate)  : "Select date"}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                  />
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Employee ID/Name</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by ID or name..."
                  value={employeeSearch}
                  onChangeText={setEmployeeSearch}
                  placeholderTextColor="#999"
                />
              </View>

              <TouchableOpacity
                style={styles.applyButton}
                onPress={handleApplyFilters}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.applyButton,{backgroundColor:'white', borderWidth:1}]}
                onPress={handleClearFiltersLocal}
              >
                <Text style={[styles.applyButtonText,{color:'black'}]}>Clear</Text>
              </TouchableOpacity>

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
     maxHeight: '80%',
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
  dateOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 15,
  },
  dateOptionButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedDateOption: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  dateOptionText: {
    fontSize: 14,
    color: '#666',
  },
  selectedDateOptionText: {
    color: 'white',
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#f9f9f9',
  },
  picker: {
    height: 50,
  },
  applyButton: {
    backgroundColor: '#1e3a8a',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  applyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FilterPopup;