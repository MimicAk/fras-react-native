import React, { useState, useRef } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  Modal, 
  Pressable, 
  findNodeHandle, 
  UIManager, 
  Dimensions 
} from "react-native";
import Colors from "../constants/colors";

interface HeaderProps {
  name: string;
  logoUrl?: string;
  onAccountPress?: () => void;
  onLogoutPress?: () => void;
  navigation:any;
}

export function Header({ name, logoUrl, onAccountPress, onLogoutPress,navigation }: HeaderProps) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ x: 0, y: 0 });
  const avatarRef = useRef<View>(null);
  
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const dropdownWidth = 140;
  const dropdownHeight = 100; // Approximate height for 2 items

const openDropdown = () => {
  if (avatarRef.current) {
    const handle = findNodeHandle(avatarRef.current);
    if (handle) {
      UIManager.measure(handle, (fx, fy, width, height, px, py) => {
        let dropdownX = px; // Align left edge of dropdown with avatar
        let dropdownY = py + height + 4; // 4px gap below avatar

        // Ensure dropdown doesn't go off the right edge
        if (dropdownX + dropdownWidth > screenWidth) {
          dropdownX = screenWidth - dropdownWidth - 16; // 16px margin from edge
        }

        // Ensure dropdown doesn't go off the left edge
        if (dropdownX < 16) {
          dropdownX = 16; // 16px margin from edge
        }

        // Check if dropdown goes below screen, if so, show above avatar
        if (dropdownY + dropdownHeight > screenHeight) {
          dropdownY = py - dropdownHeight - 4; // Show above with 4px gap
        }

        // Final safety check for top edge
        if (dropdownY < 0) {
          dropdownY = py + height + 4; // Fallback to below avatar
        }

        setDropdownPos({ x: dropdownX, y: dropdownY });
        setDropdownVisible(true);
      });
    }
  }
};

  return (
    <View style={styles.container}>
      {logoUrl ? (
        <View style={{backgroundColor:'white', padding:5, borderRadius:10}}>
          <Image  source={require('../assets/images/logo.png')} style={styles.logo} />
        </View>
      ) : (
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoText}>T</Text>
        </View>
      )}
      <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="tail">
        Hi {name}
      </Text>
      <TouchableOpacity onPress={openDropdown}>
        <View ref={avatarRef} style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0)}</Text>
        </View>
      </TouchableOpacity>
      
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setDropdownVisible(false)}
        >
          <View
            style={[
              styles.dropdown,
              {
                position: "absolute",
                left: dropdownPos.x,
                top: dropdownPos.y,
              },
            ]}
          >
            {/* <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                setDropdownVisible(false);
                onAccountPress && onAccountPress();
              }}
            >
              <Text style={styles.dropdownText}>Account</Text>
            </Pressable> */}
            
            <View style={styles.separator} />
            <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                navigation.replace("RoleSection")
              }}
            >
              <Text style={styles.dropdownText}>Switch Role</Text>
            </Pressable>
              <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                setDropdownVisible(false);
                onLogoutPress && onLogoutPress();
              }}
            >
              <Text style={styles.dropdownText}>Logout</Text>
            </Pressable>
          </View>
          
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: {
    width: 50,
    height: 50,
    resizeMode: "contain",
    backgroundColor:'white',
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: Colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  logoText: {
    color: Colors.textLight,
    fontSize: 32,
    fontWeight: "bold",
  },
  greeting: {
    color: Colors.textLight,
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    marginHorizontal: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#475569",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: Colors.textLight,
    fontSize: 24,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
  },
  dropdown: {
    backgroundColor: "#fff",
    borderRadius: 8,
    minWidth: 140,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    paddingVertical: 4,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  dropdownText: {
    fontSize: 16,
    color: "#222",
  },
  separator: {
    height: 1,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 8,
  },
});