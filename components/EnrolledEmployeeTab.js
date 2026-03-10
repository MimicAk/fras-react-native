// components/EnrolledEmployeeTab.js
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Colors from '../constants/colors';
import { config } from '../config/config';
import EmployeeDetailsModal from './EmployeeDetailsModal';
import { Eye, RotateCcw, Funnel, CheckCircle2 } from 'lucide-react-native';
import { ApiExceptions } from '../utils/APIException';
import LazyImage from './LazyImage';
import EmployeeFilterPopup from './FilterPopup';
import { useAuth } from '../AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectToDatabase, createTables } from '../database/connection';
import { updateStaff } from '../database/staff.repository';
import { searchEmployeeService } from '../services/employee.service';

export default function EnrolledEmployeeTab({
  userDetails,
  searchResult,
  refreshSearch,
  navigation,
  onEnrollmentSuccess,
  route, // ← added
  filterOption,
}) {
  const { user } = useAuth();
  const [viewEmployeeModalVisible, setViewEmployeeModalVisible] =
    useState(false);
  const [viewEmployeeCurrentData, setViewEmployeeCurrentData] = useState(null);
  const [enrolledEmployees, setEnrolledEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [permissions, setPermissions] = useState([]);

  const [showSuccess, setShowSuccess] = useState(false);

  const currentPage = useRef(1);
  const filterData = useRef({});

  const flatListRef = useRef();

  // ─── Handle successful enrollment coming back from FaceEnrollmentScreen ──
  // useEffect(() => {
  //   if (route?.params?.enrolledResult) {
  //     const { uuid, imgStr } = route.params.enrolledResult;

  //     setEnrolledEmployees((prev) =>
  //       prev.map((emp) =>
  //         emp.guid === uuid ? { ...emp, image: imgStr } : emp
  //       )
  //     );

  //     // Optional: clean up the param so it doesn't trigger again on re-focus
  //     navigation.setParams({ enrolledResult: undefined });

  //     Alert.alert("Success", "Face enrolled successfully.");
  //   }
  // }, [route?.params?.enrolledResult, navigation]);

  const slideAnim = useRef(new Animated.Value(-100)).current;

  const triggerSuccess = () => {
    setShowSuccess(true);
    // Slide down
    Animated.timing(slideAnim, {
      toValue: 20, // Final top position
      duration: 500,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();

    // Slide up and hide after 2.5s
    setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setShowSuccess(false));
    }, 2500);
  };

  // ─── Focus Effect ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      currentPage.current = 1;
      fetchEmployeeList({});
      checkUserPermissions();
    }, []),
  );

  async function checkUserPermissions() {
    try {
      const perms = await AsyncStorage.getItem('Permissions');
      setPermissions(JSON.parse(perms) || []);
    } catch {
      setPermissions([]);
    }
  }

  // ─── Fetch Employees (List or Search) ─────────────────────────
  async function fetchEmployeeList(filters = {}) {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const token = userDetails?.token;
      if (!token) throw new Error('No token available');

      let data = [];

      // Search mode
      if (filters?.employeeSearch?.trim()) {
        const searchTerm = filters.employeeSearch.trim();
        const searchResult = await searchEmployeeService({
          employeeId: searchTerm,
          token,
          navigation,
        });
        data = searchResult || [];
      }
      // Paginated list mode
      else {
        let emp_id = null;
        let name = null;
        const idPattern = /^[A-Z]{3}\d{4}$/i;
        const namePattern = /^[a-zA-Z\s]+$/;

        if (filters?.employeeSearch) {
          const searchValue = filters.employeeSearch.trim();
          if (idPattern.test(searchValue)) {
            emp_id = searchValue;
          } else if (namePattern.test(searchValue)) {
            name = searchValue;
          }
        }

        const body = {
          emp_id,
          name,
          page: currentPage.current,
          classification: filters?.classification || null,
          entity: filters?.entity || null,
          status: 1,
        };

        Object.keys(body).forEach(key => {
          if (body[key] === undefined || body[key] === null) {
            delete body[key];
          }
        });

        const response = await fetch(`${config.Base_URL}/api/employees`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          ApiExceptions(response, navigation, body);
          return;
        }

        const json = await response.json();
        data = json?.data || [];
      }

      // Update list
      if (data.length > 0) {
        if (currentPage.current === 1) {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          setEnrolledEmployees(data);
        } else {
          setEnrolledEmployees(prev => [...prev, ...data]);
        }
        currentPage.current += 1;
      }
    } catch (error) {
      Alert.alert('Error', 'Cannot fetch employee list right now.');
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Render Card ──────────────────────────────────────────────
  const renderEmployeeCard = ({ item }) => (
    <View style={styles.employeeCard}>
      <View style={styles.employeeInfo}>
        <LazyImage
          uri={item?.image}
          style={styles.avatar}
          placeholder={require('../assets/images/profileplaceholder.png')}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.employeeName}>{item?.name}</Text>
          <Text style={styles.employeeId}>ID: {item?.user?.emp_id || '—'}</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        {permissions?.includes('Enroll') && (
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => {
              navigation.navigate('FaceEnrollmentScreen', {
                staffData: item,

                onEnrollmentSuccess: () => {
                  currentPage.current = 1;
                  fetchEmployeeList(filterData.current);

                  triggerSuccess();
                },
              });
            }}
          >
            <RotateCcw size={18} />
            <Text style={styles.buttonText}>
              {item?.image ? 'Retake' : 'Enroll'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => {
            setViewEmployeeCurrentData(item);
            setViewEmployeeModalVisible(true);
          }}
        >
          <Eye size={18} />
          <Text style={styles.buttonText}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Main Render ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {isLoading && enrolledEmployees.length === 0 ? (
        <ActivityIndicator size="large" color={Colors.primary} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={searchResult?.length > 0 ? searchResult : enrolledEmployees}
          renderItem={renderEmployeeCard}
          keyExtractor={item => item.guid}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (!isLoading && enrolledEmployees.length >= 10) {
              fetchEmployeeList(filterData.current);
            }
          }}
          onEndReachedThreshold={0.3}
        />
      )}

      {filterOption && (
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilter(true)}
        >
          <Funnel size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <EmployeeDetailsModal
        employee={viewEmployeeCurrentData}
        visible={viewEmployeeModalVisible}
        onClose={() => setViewEmployeeModalVisible(false)}
      />

      <EmployeeFilterPopup
        visible={showFilter}
        userToken={user?.token}
        onClose={() => setShowFilter(false)}
        onApplyFilters={filters => {
          currentPage.current = 1;
          filterData.current = filters;
          fetchEmployeeList(filters);
        }}
      />

      {showSuccess && (
        <Animated.View
          style={[
            styles.successToast,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.toastContent}>
            <CheckCircle2 size={20} color="#fff" />
            <Text style={styles.successText}>Face enrolled successfully</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  listContainer: { padding: 16, paddingBottom: 80 },
  employeeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 4,
  },
  employeeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  employeeName: { fontSize: 16, fontWeight: '600' },
  employeeId: { fontSize: 13, color: '#666' },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginRight: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginLeft: 8,
  },
  buttonText: { marginLeft: 6, fontSize: 14 },
  filterButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },

  successToast: {
    position: 'absolute',
    top: 40, // Adjust based on your status bar height
    left: 20,
    right: 20,
    zIndex: 999,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    backgroundColor: '#059669', // A deeper, modern emerald green
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 50, // Pill shape
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  successText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    marginLeft: 10,
  },
});
