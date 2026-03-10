import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Calendar, RotateCw } from "lucide-react-native";
import Colors from "../constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TimeCardProps {
  onSync?: () => void;
  navigation:any
}

export function TimeCard({ onSync, navigation }: TimeCardProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastSync, setLastSync] = useState("Never Synced");

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    getLastSync();

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleSync = () => {
    if (onSync) onSync();
    navigation.navigate("SyncData");
  };

  const getLastSync = async () => {
    let dateTime = await AsyncStorage.getItem("lastsyncdate");
    if (dateTime == undefined) {
      setLastSync("Never Synced");
    } else {
      setLastSync(`Last synced : ${new Date(dateTime)?.toLocaleDateString()}`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.timeContainer}>
        <View>
          <Text style={styles.time}>{formatTime(currentTime)}</Text>
          <View style={styles.dateContainer}>
            <Calendar size={20} color={Colors.secondary} />
            <Text style={styles.date}>{formatDate(currentTime)}</Text>
          </View>
          <Text style={styles.syncStatus}>
              {lastSync}
          </Text>
        </View>
     
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginVertical: 8,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.text,
    marginBottom: 8,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: Colors.text,
  },
  syncStatus: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  rightContainer: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  syncText: {
    fontSize: 16,
    fontWeight: "500",
  },
  statusBadge: {
    backgroundColor: Colors.online,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: Colors.textLight,
    fontWeight: "500",
  },
});