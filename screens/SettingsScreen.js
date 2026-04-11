import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  Modal,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DeviceInfo from 'react-native-device-info';
import Slider from '@react-native-community/slider';

// Lucide Icons
import {
  ScanFace,
  UserCheck,
  Users,
  RefreshCcw,
  Cpu,
  ChevronDown,
  Check,
  Save,
  ArrowLeft,
  Settings2,
  Camera,
} from 'lucide-react-native';

import {
  SETTINGS_CONFIG,
  getAllSettings,
  saveSetting,
} from '../utils/settings.helper';

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const IconMap = {
  ScanFace,
  UserCheck,
  Users,
  RefreshCcw,
  Cpu,
  Camera,
};

// Upgraded Premium Theme
const theme = {
  primary: '#4F46E5', // Modern Indigo
  primaryLight: '#EEF2FF',
  success: '#10B981',
  background: '#F4F4F5', // Softer, premium gray
  surface: '#FFFFFF',
  textMain: '#0F172A',
  textSub: '#64748B',
  border: '#E4E4E7',
  muted: '#A1A1AA',
};

export default function SettingsScreen({ navigation }) {
  const [settingsForm, setSettingsForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [dropdownConfig, setDropdownConfig] = useState({
    visible: false,
    config: null,
  });

  const appVersion = DeviceInfo.getVersion();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const currentSettings = await getAllSettings();
    setSettingsForm(currentSettings);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLoading(false);
  };

  const handleValueChange = (key, value) => {
    setSettingsForm(prev => ({ ...prev, [key]: value }));
  };

  // Add explicitValue parameter
  const handleSave = async (key, explicitValue) => {
    setSavingKey(key);
    // If an explicit value is passed, save that. Otherwise fallback to state.
    const valueToSave =
      explicitValue !== undefined ? explicitValue : settingsForm[key];
    await saveSetting(key, valueToSave);

    // Smooth UI feedback duration
    setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSavingKey(null);
    }, 800);
  };

  const groupedSettings = useMemo(() => {
    return SETTINGS_CONFIG.reduce((acc, config) => {
      const group = config.group || 'General';
      if (!acc[group]) acc[group] = [];
      acc[group].push(config);
      return acc;
    }, {});
  }, []);

  // Premium Bottom Sheet Modal
  const DropdownModal = () => (
    <Modal visible={dropdownConfig.visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalDismissArea}
          activeOpacity={1}
          onPress={() => setDropdownConfig({ visible: false, config: null })}
        />
        <View style={styles.dropdownContainer}>
          <View style={styles.modalGrabber} />
          <Text style={styles.dropdownTitle}>
            {dropdownConfig.config?.label}
          </Text>
          <Text style={styles.dropdownSubTitle}>
            Select your preferred configuration
          </Text>

          <View style={styles.optionsWrapper}>
            {dropdownConfig.config?.options.map(opt => {
              const isSelected =
                settingsForm[dropdownConfig.config.key] === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.dropdownOption,
                    isSelected && styles.dropdownOptionActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    handleValueChange(dropdownConfig.config.key, opt.value);
                    handleSave(dropdownConfig.config.key, opt.value);
                    setDropdownConfig({ visible: false, config: null });
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      isSelected && styles.dropdownOptionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.activeCheckCircle}>
                      <Check size={14} color={theme.surface} strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderInput = config => {
    const value = settingsForm[config.key];
    const isSaving = savingKey === config.key;

    if (config.inputType === 'slider') {
      return (
        <View style={styles.inputWrapper}>
          <Slider
            style={styles.slider}
            minimumValue={config.min}
            maximumValue={config.max}
            step={config.step}
            value={Number(value) || config.default}
            onSlidingComplete={val => {
              handleValueChange(config.key, val);
              handleSave(config.key, val);
            }}
            onValueChange={val => handleValueChange(config.key, val)}
            minimumTrackTintColor={theme.primary}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.primaryLight}
          />
        </View>
      );
    }

    if (config.inputType === 'dropdown') {
      const selectedLabel =
        config.options.find(o => o.value === value)?.label || value;
      return (
        <TouchableOpacity
          style={styles.dropdownPicker}
          activeOpacity={0.7}
          onPress={() => setDropdownConfig({ visible: true, config })}
        >
          <Text style={styles.dropdownPickerText}>{selectedLabel}</Text>
          <ChevronDown size={18} color={theme.textSub} />
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.textInputRow}>
        <TextInput
          style={styles.textInput}
          value={String(value)}
          onChangeText={val => handleValueChange(config.key, val)}
          keyboardType={config.type === 'float' ? 'decimal-pad' : 'number-pad'}
          selectionColor={theme.primary}
        />
        <TouchableOpacity
          style={[styles.saveBtnSmall, isSaving && styles.saveBtnSuccess]}
          activeOpacity={0.8}
          onPress={() => handleSave(config.key)}
        >
          {isSaving ? (
            <Check size={18} color={theme.surface} strokeWidth={3} />
          ) : (
            <Save size={18} color={theme.primary} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      {/* Premium Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Dashboard');
            }
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={24} color={theme.textMain} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrapper}>
          <Text style={styles.headerTitle}>Preferences</Text>
          <Settings2
            size={20}
            color={theme.textSub}
            style={{ marginLeft: 8 }}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {Object.keys(groupedSettings).map(groupName => (
          <View key={groupName} style={styles.groupWrapper}>
            <Text style={styles.groupTitle}>{groupName}</Text>

            <View style={styles.modernCard}>
              {groupedSettings[groupName].map((config, index) => {
                const IconComponent = IconMap[config.icon] || Cpu;
                const isLast = index === groupedSettings[groupName].length - 1;
                const currentValue = settingsForm[config.key];

                return (
                  <View key={config.key}>
                    <View style={styles.settingRow}>
                      {/* Setting Header: Icon, Label, and Value Badge */}
                      <View style={styles.settingTopRow}>
                        <View style={styles.settingHeaderLeft}>
                          <View style={styles.iconBg}>
                            <IconComponent size={18} color={theme.primary} />
                          </View>
                          <Text style={styles.settingLabel}>
                            {config.label}
                          </Text>
                        </View>

                        {config.inputType === 'slider' && (
                          <View style={styles.valueBadge}>
                            <Text style={styles.valueBadgeText}>
                              {Number(currentValue).toFixed(2)}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.settingDesc}>
                        {config.description}
                      </Text>

                      {/* Control Area */}
                      <View style={styles.controlArea}>
                        {renderInput(config)}
                      </View>
                    </View>

                    {!isLast && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerVersion}>V {appVersion}</Text>
        </View>
      </ScrollView>

      <DropdownModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: theme.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.textMain,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.textMain,
    letterSpacing: -0.5,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  groupWrapper: { marginTop: 24 },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSub,
    letterSpacing: 1.2,
    marginBottom: 12,
    textTransform: 'uppercase',
    paddingLeft: 8,
  },

  modernCard: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(228, 228, 231, 0.8)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
    }),
  },

  settingRow: { paddingVertical: 16, paddingHorizontal: 20 },
  settingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  settingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  settingLabel: { fontSize: 16, fontWeight: '700', color: theme.textMain },

  valueBadge: {
    backgroundColor: theme.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  valueBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.primary,
    fontVariant: ['tabular-nums'],
  },

  settingDesc: {
    fontSize: 13,
    color: theme.textSub,
    lineHeight: 18,
    paddingLeft: 52,
    marginBottom: 16,
  },

  controlArea: { paddingLeft: 52 },
  divider: { height: 1, backgroundColor: theme.border, marginLeft: 72 },

  // Sliders
  inputWrapper: {
    height: 24,
    justifyContent: 'center',
  },
  slider: {
    width: '100%',
    height: 80,
    ...Platform.select({
      ios: {
        shadowColor: theme.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
    }),
  },

  // Dropdown
  dropdownPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownPickerText: {
    fontSize: 15,
    color: theme.textMain,
    fontWeight: '600',
  },

  // Text Input
  textInputRow: { flexDirection: 'row', alignItems: 'center' },
  textInput: {
    flex: 1,
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: theme.textMain,
    marginRight: 12,
  },
  saveBtnSmall: {
    backgroundColor: theme.primaryLight,
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnSuccess: {
    backgroundColor: theme.success,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: { flex: 1 },
  dropdownContainer: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalGrabber: {
    width: 48,
    height: 5,
    backgroundColor: theme.border,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 24,
  },
  dropdownTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.textMain,
    marginBottom: 4,
  },
  dropdownSubTitle: {
    fontSize: 14,
    color: theme.textSub,
    marginBottom: 24,
  },
  optionsWrapper: {
    backgroundColor: theme.background,
    borderRadius: 20,
    padding: 8,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  dropdownOptionActive: {
    backgroundColor: theme.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  dropdownOptionText: {
    fontSize: 16,
    color: theme.textMain,
    fontWeight: '600',
  },
  dropdownOptionTextActive: { color: theme.primary, fontWeight: '800' },
  activeCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Footer
  footer: { paddingTop: 40, paddingBottom: 20, alignItems: 'center' },
  footerVersion: { fontSize: 14, color: theme.textMain, fontWeight: '700' },
  footerSub: {
    fontSize: 12,
    color: theme.muted,
    marginTop: 4,
    fontWeight: '500',
  },
});
