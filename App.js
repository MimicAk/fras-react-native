// StackNavigator.js
import React from 'react';
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
      <Stack.Screen name="RoleSection" component={RoleSelectionScreen} />
      <Stack.Screen name="Employees" component={EmployeesScreen} />
      <Stack.Screen name="FaceEnrollmentScreen" component={FaceEnrollmentScreen} />
    </Stack.Navigator>
  );
}

export default function StackNavigator() {
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
