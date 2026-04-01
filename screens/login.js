import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Alert,
  Image,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock, Mail, Eye, EyeOff } from "lucide-react-native";
import { Button } from "../components/Button";
import { TextInput } from "../components/TextInput";
import Colors from "../constants/colors";
import { config } from "../config/config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../AuthContext";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Invalid Input", "Please enter both Employee ID and Password");
      return;
    }

    setIsLoading(true);

    try {
      const loginResponse = await fetch(config.Base_URL + "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      if (!loginResponse.ok) {
        throw new Error("Login failed");
      }

      const userData = await loginResponse.json();
      const user = userData?.data?.data;
      if (!user) throw new Error("Invalid response format");

      user.token = userData?.data?.access_token;

      await AsyncStorage.removeItem("Project");
      login(user);
      navigation.replace("RoleSelection");
    } catch (error) {
      Alert.alert("Login Failed", "Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.inner}>
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Image
                  source={require("../assets/images/logo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                label="Employee ID"
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your Employee ID"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                icon={<Mail size={20} color={Colors.textSecondary} />}
              />

              <View style={styles.passwordContainer}>
                <TextInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  secureTextEntry={!showPassword}
                  icon={<Lock size={20} color={Colors.textSecondary} />}
                />

                <TouchableOpacity
                  onPress={togglePasswordVisibility}
                  style={styles.eyeIconContainer}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={Colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={Colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              <Button
                title={isLoading ? "Signing in..." : "Sign In"}
                onPress={handleLogin}
                disabled={isLoading}
                style={styles.button}
              >
                {isLoading && (
                  <ActivityIndicator color="#fff" style={styles.loader} />
                )}
              </Button>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
  },
  logo: {
    width: "90%",
    height: "90%",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  form: {
    gap: 20,
  },
  passwordContainer: {
    position: "relative",
  },
  eyeIconContainer: {
    position: "absolute",
    right: 16,
    top: 45,
    padding: 5,
    zIndex: 1,
  },
  button: {
    marginTop: 12,
    backgroundColor: Colors.primary,
  },
  loader: {
    marginLeft: 8,
  },
});