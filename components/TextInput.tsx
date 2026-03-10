import React from "react";
import { View, Text, TextInput as RNTextInput, StyleSheet, TextInputProps } from "react-native";
import Colors from "../constants/colors";

interface CustomTextInputProps extends TextInputProps {
  label: string;
  icon?: React.ReactNode;
}

export function TextInput({ label, icon, ...props }: CustomTextInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <RNTextInput
          style={[styles.input, icon ? styles.inputWithIcon : null]}
          placeholderTextColor={Colors.placeholder}
          {...props}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
    color: Colors.text,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.inputBackground,
  },
  iconContainer: {
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    height: 56,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text,
  },
  inputWithIcon: {
    paddingLeft: 8,
  },
});