import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
} from 'lucide-react-native';

const SmallAlert = ({ visible, type = 'info', message, duration = 3000 }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  // Logic left exactly as original
  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }).start();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Tweaked hex codes to richer, more premium shades
  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return '#10b981'; // Premium Emerald Green
      case 'error':
        return '#ef4444'; // Premium Rose Red
      case 'warning':
        return '#f59e0b'; // Premium Amber
      default:
        return '#3b82f6'; // Premium Blue
    }
  };

  // Added dynamic icons based on the alert type
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={20} color="white" />;
      case 'error':
        return <AlertCircle size={20} color="white" />;
      case 'warning':
        return <AlertTriangle size={20} color="white" />;
      default:
        return <Info size={20} color="white" />;
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: getBackgroundColor(),
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        {getIcon()}
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 60,
    alignSelf: 'center',
    borderRadius: 30, // Modern pill shape
    zIndex: 999,
    // Cross-platform floating shadows
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    minWidth: '60%',
    maxWidth: '90%', // Prevents text from stretching edge-to-edge on long messages
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  text: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
    flexShrink: 1, // Allows text to wrap nicely without pushing the icon out
    letterSpacing: 0.3,
  },
});

export default SmallAlert;
