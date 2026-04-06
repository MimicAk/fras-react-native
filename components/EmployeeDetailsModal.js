import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';

import { X } from 'lucide-react-native';

import LazyImage from './LazyImage';

const EmployeeDetailsModal = ({ visible, onClose, employee }) => {
  const [previewVisible, setPreviewVisible] = useState(false);

  return (
    <>
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Employee Details</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              {/* Identity Profile Section */}
              <View style={styles.profileSection}>
                {/* Wrapped Avatar in TouchableOpacity to trigger preview */}
                <TouchableOpacity
                  style={styles.avatarContainer}
                  activeOpacity={employee?.image ? 0.8 : 1}
                  onPress={() => {
                    if (employee?.image) setPreviewVisible(true);
                  }}
                >
                  <LazyImage
                    uri={employee?.image}
                    style={styles.avatar}
                    placeholder={require('../assets/images/profileplaceholder.png')}
                  />
                </TouchableOpacity>

                <View style={styles.profileDetails}>
                  <Text style={styles.name} numberOfLines={1}>
                    {employee?.name}
                  </Text>
                  <Text style={styles.id}>ID: {employee?.user?.emp_id}</Text>

                  {/* Enrollment Status Badge */}
                  <View style={styles.badgeWrapper}>
                    {employee?.image ? (
                      <View style={[styles.badge, styles.badgeSuccess]}>
                        <Text style={[styles.badgeIcon, styles.textSuccess]}>
                          ✓
                        </Text>
                        <Text style={[styles.badgeText, styles.textSuccess]}>
                          Enrolled
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, styles.badgeWarning]}>
                        <Text style={[styles.badgeIcon, styles.textWarning]}>
                          ✕
                        </Text>
                        <Text style={[styles.badgeText, styles.textWarning]}>
                          Not Enrolled
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Work Information Section */}
              <View style={styles.infoBox}>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Entity</Text>
                  <Text style={styles.value}>
                    {employee?.entities?.entityname || 'N/A'}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.infoRow}>
                  <Text style={styles.label}>Classification</Text>
                  <Text style={styles.value}>
                    {employee?.classifications?.description || 'N/A'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Footer Action */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Preview Lightbox */}
      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.previewOverlay}>
          <TouchableOpacity
            style={styles.previewCloseBtn}
            onPress={() => setPreviewVisible(false)}
            activeOpacity={0.7}
          >
            <X size={24} color="#ffffff" />
          </TouchableOpacity>

          <Image
            source={{ uri: employee?.image }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </>
  );
};

export default EmployeeDetailsModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 20,
    color: '#64748b',
    fontWeight: '600',
  },
  content: {
    padding: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    marginRight: 16,
    borderRadius: 40,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  profileDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  id: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 10,
  },
  badgeWrapper: {
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeSuccess: {
    backgroundColor: '#ecfdf5',
  },
  badgeWarning: {
    backgroundColor: '#fffbeb',
  },
  badgeIcon: {
    fontSize: 12,
    marginRight: 6,
    fontWeight: '800',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  textSuccess: {
    color: '#10b981',
  },
  textWarning: {
    color: '#f59e0b',
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoRow: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  closeButton: {
    backgroundColor: '#1a365d',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1a365d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  /* --- Image Preview Styles --- */
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)', // Very dark for focus
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Slightly more visible
    borderRadius: 25, // Half of width/height for a perfect circle
    height: 50,
    width: 50,
    alignItems: 'center', // Centers horizontally
    justifyContent: 'center', // Centers vertically
  },
  previewCloseText: {
    padding: 0,
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center', // Ensures the text glyph itself is centered
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
});
