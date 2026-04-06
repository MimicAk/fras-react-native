import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  BlurView,
} from 'react-native';
import { UserCheck, X, Check, Fingerprint } from 'lucide-react-native';

const { width } = Dimensions.get('window');

// Professional SaaS Theme
const theme = {
  primary: '#2563EB',
  success: '#10B981',
  danger: '#EF4444',
  surface: '#FFFFFF',
  textMain: '#0F172A',
  textSub: '#64748B',
  background: 'rgba(15, 23, 42, 0.8)', // Dark blurred overlay
};

const FaceConfirmationPopup = ({
  visible,
  employee,
  onConfirm,
  onCancel,
  checkType = 'in',
}) => {
  if (!visible || !employee) return null;

  // Your shared Image Logic
  const getUserImageSource = () => {
    if (employee.img) {
      if (
        typeof employee.img === 'string' &&
        (employee.img.startsWith('http://') ||
          employee.img.startsWith('https://'))
      ) {
        return { uri: employee.img };
      } else {
        return { uri: `data:image/jpeg;base64,${employee.img}` };
      }
    }
    return {
      uri: `https://ui-avatars.com/api/?name=${employee.name}&background=2563EB&color=fff&size=256`,
    };
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header Icon */}
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: checkType === 'in' ? '#ECFDF5' : '#EFF6FF' },
            ]}
          >
            <Fingerprint
              size={20}
              color={checkType === 'in' ? theme.success : theme.primary}
            />
            <Text
              style={[
                styles.typeText,
                { color: checkType === 'in' ? theme.success : theme.primary },
              ]}
            >
              Attendance Check-{checkType.toUpperCase()}
            </Text>
          </View>

          {/* User Image Section */}
          <View style={styles.imageContainer}>
            <View style={styles.imageRing}>
              <Image source={getUserImageSource()} style={styles.avatar} />
            </View>
            <View style={styles.verifiedBadge}>
              <Check size={12} color="white" strokeWidth={4} />
            </View>
          </View>

          {/* Employee Details */}
          <View style={styles.infoSection}>
            <Text style={styles.name}>{employee.name}</Text>
            <View style={styles.idBadge}>
              <Text style={styles.idText}>STAFF ID: {employee.staffid}</Text>
            </View>
            <Text style={styles.message}>
              System identified your face. Do you want to proceed with this
              {checkType === 'in' ? ' check-in' : ' check-out'}?
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <X size={20} color={theme.textSub} />
              <Text style={styles.cancelBtnText}>Discard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor:
                    checkType === 'in' ? theme.success : theme.primary,
                },
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <UserCheck size={20} color="white" />
              <Text style={styles.confirmBtnText}>Confirm Identity</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default FaceConfirmationPopup;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: theme.surface,
    borderRadius: 32,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
    marginBottom: 24,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  imageContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  imageRing: {
    padding: 4,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F1F5F9',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: theme.success,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  infoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.textMain,
    textAlign: 'center',
    marginBottom: 8,
  },
  idBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  idText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSub,
    letterSpacing: 1,
  },
  message: {
    fontSize: 14,
    color: theme.textSub,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textSub,
    marginLeft: 8,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    marginLeft: 8,
  },
});
