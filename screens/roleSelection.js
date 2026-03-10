// screens/RoleSelectionScreen.js
import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
  Alert,
} from 'react-native';
import { LogOut } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../AuthContext';

export default function RoleSelectionScreen({ navigation }) {
  const { user, logout } = useAuth();

  useEffect(() => {
    // Auto-select if user has exactly one role
    if (user?.roles?.length === 1) {
      const singleRole = user.roles[0];
      handleSelectRole(singleRole?.guid);
    }
  }, [user]);

  const handleSelectRole = async (roleGuid) => {
    if (!roleGuid) return;

    try {
      await AsyncStorage.setItem('AttendanceType', roleGuid);
      navigation.replace('LandingPage');
    } catch (err) {
      Alert.alert('Error', 'Failed to save role selection. Please try again.');
    }
  };

  const handleLogout = () => {
    logout();
  };

  const renderRoleItem = ({ item }) => (
    <TouchableOpacity
      style={styles.roleCard}
      onPress={() => handleSelectRole(item?.guid)}
      activeOpacity={0.8}
    >
      <Image
        source={
          item?.roleimage
            ? { uri: item.roleimage }
            : require('../assets/images/placeholder-role.png') // fallback image
        }
        style={styles.roleIcon}
        resizeMode="contain"
      />

      <View style={styles.cardContent}>
        <Text style={styles.roleName} numberOfLines={1}>
          {item?.rolename?.trim() || 'Unnamed Role'}
        </Text>
        <Text style={styles.roleDesc} numberOfLines={2}>
          {item?.roledesc?.trim() || 'No description available'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // No roles → show message + logout
  if (!user?.roles || user.roles.length === 0) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/7/71/Arabic_Calligraphy_Logo.png' }}
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
      {/* Logout button (top-right) */}
      <TouchableOpacity style={styles.logoutTop} onPress={handleLogout}>
        <LogOut size={22} color="#64748B" />
      </TouchableOpacity>

      <Image
        source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/7/71/Arabic_Calligraphy_Logo.png' }}
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
        keyExtractor={(item) => item?.guid || item?.id || Math.random().toString()}
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
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginVertical: 8,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  cardContent: {
    flex: 1,
    marginLeft: 16,
  },
  roleName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  roleDesc: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
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
});