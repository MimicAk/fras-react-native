// screens/Splash.js
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native-svg';

import DeviceInfo from 'react-native-device-info';
const { width, height } = Dimensions.get('window');

// Professional Enterprise Theme (Matching your Dashboard)
const theme = {
  primary: '#2563EB',
  background: '#F8FAFC',
  textMain: '#0F172A',
  textSub: '#64748B',
  accent: '#E2E8F0',
};

function Splash({ navigation }) {
  const { user } = useAuth();
  const fadeAnim = new Animated.Value(0);
  const scaleAnim = new Animated.Value(0.9);

  const appVersion = DeviceInfo.getVersion();

  useEffect(() => {
    // Simple entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      checkUserDetails();
    }, 3000);

    return () => clearTimeout(timer);
  }, [user]);

  async function checkUserDetails() {
    try {
      let role = await AsyncStorage.getItem('AttendanceType');

      // Logic optimization
      if (user?.token) {
        if (role) {
          navigation.replace('LandingPage');
        } else {
          navigation.replace('RoleSelection');
        }
      } else {
        navigation.replace('Login');
      }
    } catch (error) {
      console.error('Error in checkUserDetails:', error);
      navigation.replace('Login');
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Soft Ambient Background Elements */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <Animated.View
        style={[
          styles.logoContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.iconBox}>
          <Image
            source={require('./../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.logoTitle}>FRAS</Text>
        <Text style={styles.logoSubtitle}>Smart Attendance System</Text>
      </Animated.View>

      {/* Bottom Footer Info */}
      <View style={styles.footer}>
        <ActivityIndicator
          size="small"
          color={theme.primary}
          style={{ marginBottom: 16 }}
        />
        {/* <Text style={styles.footerText}>Securely initializing workspace</Text> */}
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>{appVersion}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blobTop: {
    position: 'absolute',
    top: -height * 0.15,
    right: -width * 0.1,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width,
    backgroundColor: '#EFF6FF', // theme.primaryLight
  },
  blobBottom: {
    position: 'absolute',
    bottom: -height * 0.1,
    left: -width * 0.2,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width,
    backgroundColor: '#F1F5F9',
  },
  logoContainer: {
    alignItems: 'center',
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 20,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
  },
  logoTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.textMain,
    letterSpacing: 2,
  },
  logoSubtitle: {
    fontSize: 14,
    color: theme.textSub,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: theme.textSub,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  versionBadge: {
    marginTop: 12,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  versionText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  logoImage: {
    width: '70%',
    height: '70%',
  },
});

export default Splash;
