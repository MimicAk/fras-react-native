import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronDown } from "lucide-react-native";
import Colors from "../constants/colors";

interface LocationSelectorProps {
  location: string;
  onPress?: () => void;
}

export function LocationSelector({ location, onPress }: LocationSelectorProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Text style={styles.location}>{location}</Text>
      <ChevronDown size={24} color={Colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginVertical: 8,
  },
  location: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.text,
  },
});