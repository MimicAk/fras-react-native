import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import { Search } from 'lucide-react-native';
import Colors from '../constants/colors';
import { useAuth } from '../AuthContext';
import EnrolledEmployeeTab from './EnrolledEmployeeTab';
import { searchEmployeeService } from '../services/employee.service';

export default function EnrollEmployeeTab({ navigation }) {
  const [employeeList, setEmployeeList] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const { user } = useAuth();
  const debounceRef = useRef(null);

  /* =======================================
     CLEANUP DEBOUNCE ON UNMOUNT
  ======================================== */
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /* =======================================
     SEARCH HANDLER (Debounced + Safe)
  ======================================== */
  const handleSearch = useCallback(
    value => {
      setEmployeeId(value);

      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Minimum 2 characters required
      if (!value || value.trim().length < 2) {
        setEmployeeList([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          setIsSearching(true);



          const results = await searchEmployeeService({
            employeeId: value.trim(),
            token: user?.token,
            navigation,
          });

          // Ensure array
          setEmployeeList(Array.isArray(results) ? results : []);


        } catch (error) {
          setEmployeeList([]);

        } finally {
          setIsSearching(false);
        }
      }, 500);
    },
    [navigation, user?.token],
  );

  /* =======================================
     RENDER
  ======================================== */
  return (
    <View style={styles.container}>
      {/* Search Section */}
      <View style={styles.searchSection}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter Employee ID or Name"
            value={employeeId}
            onChangeText={handleSearch}
            placeholderTextColor="#999"
          />

          <View style={styles.searchButton}>
            {isSearching ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Search size={20} color="white" />
            )}
          </View>
        </View>
      </View>

      {/* Results */}
      {employeeList.length > 0 ? (
        <EnrolledEmployeeTab
          userDetails={user}
          searchResult={employeeList}
          refreshSearch={() => handleSearch(employeeId)}
          navigation={navigation}
          filterOption={false}
        />
      ) : (
        <View style={styles.centerContent}>
          <Search size={50} color={Colors.textSecondary} />
          <Text style={styles.title}>Search for Employee</Text>
          <Text style={styles.subtitle}>
            Enter at least 2 characters to search
          </Text>
        </View>
      )}
    </View>
  );
}

/* =======================================
   STYLES
======================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    marginRight: 12,
  },
  searchButton: {
    width: 50,
    height: 50,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
