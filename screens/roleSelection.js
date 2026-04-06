// screens/RoleSelectionScreen.js
import React, { useEffect, useRef } from 'react'; // Added useRef
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
  Alert,
} from 'react-native';
import { LogOut, ChevronRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../AuthContext';

export default function RoleSelectionScreen({ navigation }) {
  const { user, logout } = useAuth();
  const hasNavigated = useRef(false); // Ref to prevent multiple navigation attempts

  console.log(user);

  useEffect(() => {
    // Check if we already handled the auto-selection to prevent loops
    if (hasNavigated.current) return;

    if (user?.roles?.length === 1) {
      const singleRole = user.roles[0];
      if (singleRole?.guid) {
        hasNavigated.current = true; // Mark as navigating
        handleSelectRole(singleRole.guid);
      }
    }
  }, [user]);

  const handleSelectRole = async roleGuid => {
    if (!roleGuid) return;

    try {
      await AsyncStorage.setItem('AttendanceType', roleGuid);
      // Use setImmediate or a small timeout to ensure the effect has finished
      // and prevent "Already navigating" errors
      setTimeout(() => {
        navigation.replace('LandingPage');
      }, 0);
    } catch (err) {
      hasNavigated.current = false; // Reset on error so user can try again
      Alert.alert('Error', 'Failed to save role selection. Please try again.');
    }
  };

  const handleLogout = () => {
    logout();

    setTimeout(() => {
      navigation.replace('Login');
    }, 1000);
  };

  // Helper to safely render roles
  const getPermissions = permString => {
    try {
      const parsed = JSON.parse(permString);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const renderRoleItem = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => handleSelectRole(item?.guid)}
        activeOpacity={0.8}
      >
        {/* --- AVATAR & STATUS --- */}
        <View style={styles.iconContainer}>
          {item?.roleimage ? (
            <Image
              source={{ uri: item.roleimage }}
              style={styles.roleIcon}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.roleCodeFallback}>
              <Text style={styles.roleCodeText}>
                {item?.rolecode || item?.rolename?.charAt(0) || '?'}
              </Text>
            </View>
          )}

          {/* Active Status Dot */}
          {item?.isactive && <View style={styles.activeDot} />}
        </View>

        {/* --- CONTENT --- */}
        <View style={styles.cardContent}>
          <Text style={styles.roleName} numberOfLines={1}>
            {item?.rolename?.trim() || 'Unnamed Role'}
          </Text>
          <Text style={styles.roleDesc} numberOfLines={2}>
            {item?.roledesc?.trim() || 'No description available'}
          </Text>
        </View>

        {/* --- ACTION ICON --- */}
        <ChevronRight size={20} color="#CBD5E1" />
      </TouchableOpacity>
    );
  };

  // Guard: If user is null/loading, show nothing or a loader to prevent crashes
  if (!user) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // No roles → show message + logout
  if (!user?.roles || user.roles.length === 0) {
    return (
      <View style={styles.container}>
        <Image
          source={{
            uri: 'https://upload.wikimedia.org/wikipedia/commons/7/71/Arabic_Calligraphy_Logo.png',
          }}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>No Roles Assigned</Text>
        <Text style={styles.subtitle}>
          You don't have any roles assigned.{'\n'}
          Please contact your administrator.
        </Text>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color="#fff" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.logoutTop} onPress={handleLogout}>
        <LogOut size={22} color="#64748B" />
      </TouchableOpacity>

      <Image
        source={{
          uri: 'https://upload.wikimedia.org/wikipedia/commons/7/71/Arabic_Calligraphy_Logo.png',
        }}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.title}>Select Your Role</Text>
      <Text style={styles.subtitle}>
        Choose the role you'll use for this session
      </Text>

      <FlatList
        data={user.roles}
        renderItem={renderRoleItem}
        keyExtractor={(item, index) => item?.guid || index.toString()}
        style={{ width: '100%' }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  logoutTop: {
    position: 'absolute',
    top: 50,
    right: 24,
    padding: 12,
    zIndex: 10,
  },
  logo: {
    width: 90,
    height: 90,
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 22,
  },
  listContent: {
    width: '100%',
    paddingBottom: 40,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 40,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },

  roleCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    width: '100%', // Forces full width
    // Shadow for iOS
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    // Elevation for Android
    elevation: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9', // Very subtle border for crispness
  },
  iconContainer: {
    position: 'relative',
    marginRight: 16,
  },
  roleIcon: {
    width: 54,
    height: 54,
    borderRadius: 16, // Squircle look (or make it 27 for a perfect circle)
  },
  roleCodeFallback: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleCodeText: {
    color: '#4F46E5',
    fontSize: 20,
    fontWeight: 'bold',
  },
  activeDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cardContent: {
    flex: 1, // Pushes the Chevron to the far right
    justifyContent: 'center',
  },
  roleName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
});
