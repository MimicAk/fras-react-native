// StackNavigator.js
import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './screens/login';
import Splash from './screens/splash';
import SyncData from './screens/syncdata';
import LandingPage from './screens/landingPage';
import RoleSelectionScreen from './screens/roleSelection';
import EmployeesScreen from './screens/employee';

import { AuthProvider } from './AuthContext';
import FaceEnrollmentScreen from './screens/FaceEnrollmentScreen';
import SettingsScreen from './screens/SettingsScreen';
import DashboardScreen from './screens/dashboard';

import { initializeSettings } from './utils/settings.helper';
import Logger from './services/bugfender.service';

import Orientation from 'react-native-orientation-locker';

const Stack = createStackNavigator();

function AppContent() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Splash" component={Splash} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="LandingPage" component={LandingPage} />
      <Stack.Screen name="SyncData" component={SyncData} />
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
      <Stack.Screen name="Employees" component={EmployeesScreen} />
      <Stack.Screen
        name="FaceEnrollmentScreen"
        component={FaceEnrollmentScreen}
      />
      <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
    </Stack.Navigator>
  );
}

export default function StackNavigator() {
  useEffect(() => {
    const setupSettings = async () => {
      try {
        await initializeSettings();
        console.log('[App Boot] Settings loaded into cache successfully.');
      } catch (error) {
        console.error('[App Boot] Failed to load settings:', error);
      }
    };

    Logger.init();
    Orientation.lockToPortrait();

    setupSettings();

    return () => {
      Orientation.unlockAllOrientations();
    };
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
