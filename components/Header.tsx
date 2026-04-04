import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { UserCircle, LogOut, ChevronDown, Repeat } from 'lucide-react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface HeaderProps {
  name: string;
  userImg?: string; // Passed from your auth/user context
  logoUrl?: string;
  onLogoutPress?: () => void;
  navigation: any;
}

export function Header({
  name,
  userImg,
  logoUrl,
  onLogoutPress,
  navigation,
}: HeaderProps) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ x: 0, y: 0 });
  const avatarRef = useRef<View>(null);

  // Logic for the user avatar source
  const getUserImageSource = () => {
    if (userImg) {
      if (
        typeof userImg === 'string' &&
        (userImg.startsWith('http://') || userImg.startsWith('https://'))
      ) {
        return { uri: userImg };
      } else {
        return { uri: `data:image/jpeg;base64,${userImg}` };
      }
    }
    return {
      uri: `https://ui-avatars.com/api/?name=${name}&background=0059C8&color=fff`,
    };
  };

  const openDropdown = () => {
    if (!avatarRef.current) return;

    avatarRef.current.measureInWindow((x, y, width, height) => {
      let dropdownX = x + width - 160; // Align to right of avatar
      let dropdownY = y + height + 8;

      // Boundary checks
      if (dropdownX < 10) dropdownX = 10;
      setDropdownPos({ x: dropdownX, y: dropdownY });
      setDropdownVisible(true);
    });
  };

  return (
    <View style={styles.container}>
      {/* Left Section: Logo */}
      <View style={styles.leftSection}>
        <Image
          source={require('../assets/images/logo.png')}
          style={styles.logo}
        />
      </View>

      {/* Right Section: Greeting & Profile */}
      <TouchableOpacity
        style={styles.profileTrigger}
        onPress={openDropdown}
        activeOpacity={0.7}
      >
        <View style={styles.textContainer}>
          <Text style={styles.greetingLabel}>Welcome back,</Text>
          <Text style={styles.nameText} numberOfLines={1}>
            {name}
          </Text>
        </View>

        <View ref={avatarRef} style={styles.avatarWrapper}>
          <Image source={getUserImageSource()} style={styles.avatarImage} />
          <View style={styles.onlineBadge} />
        </View>
        <ChevronDown size={14} color="#64748B" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      {/* Dropdown Menu */}
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
                position: 'absolute',
                left: dropdownPos.x,
                top: dropdownPos.y,
              },
            ]}
          >
            <View style={styles.dropdownHeader}>
              <Text style={styles.signedInAs}>Signed in as</Text>
              <Text style={styles.dropdownName}>{name}</Text>
            </View>

            <View style={styles.separator} />

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setDropdownVisible(false);
                setTimeout(() => {
                  navigation.replace('RoleSelection');
                }, 100);
              }}
            >
              <Repeat size={18} color="#64748B" />
              <Text style={styles.dropdownText}>Switch Role</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setDropdownVisible(false);
                onLogoutPress && onLogoutPress();
              }}
            >
              <LogOut size={18} color="#EF4444" />
              <Text style={[styles.dropdownText, { color: '#EF4444' }]}>
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  profileTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'flex-end',
    marginRight: 10,
    display: Platform.OS === 'web' ? 'flex' : 'none', // Optional: Hide greeting text on small mobile if crowded
  },
  greetingLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.02)', // Very subtle dimming
  },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 180,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  dropdownHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  signedInAs: {
    fontSize: 11,
    color: '#94A3B8',
  },
  dropdownName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    marginLeft: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
});
