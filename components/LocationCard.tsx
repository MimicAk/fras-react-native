import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MapPin } from "lucide-react-native";
import Colors from "../constants/colors";

interface LocationCardProps {
  location: string;
  coordinates: string;
  currentProject: any;
}

export function LocationCard({ location, coordinates, currentProject }: LocationCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MapPin size={24} color={Colors.secondary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.location}>{currentProject?.projectname}</Text>
        <Text style={styles.coordinates}>{location}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginVertical: 8,
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  location: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.text,
    marginBottom: 4,
  },
  coordinates: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});