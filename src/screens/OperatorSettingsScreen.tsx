import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  NativeModules,
  Alert,
} from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { revokeSettingsAccess } from '../utils/authState';
import BrightnessModule from '../utils/BrightnessModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

const { KioskModule } = NativeModules;

type OperatorSettingsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'OperatorSettings'>;

interface OperatorSettingsScreenProps {
  navigation: OperatorSettingsNavigationProp;
}

const BRIGHTNESS_STEP = 25; // percent increments

const OperatorSettingsScreen: React.FC<OperatorSettingsScreenProps> = ({ navigation }) => {
  const [brightness, setBrightness] = useState<number>(50);

  useEffect(() => {
    loadBrightness();
  }, []);

  const loadBrightness = async (): Promise<void> => {
    try {
      const level = await BrightnessModule.getBrightnessLevel();
      // getBrightnessLevel returns 0–1; convert to 0–100 and round to nearest step
      const pct = Math.round((level * 100) / BRIGHTNESS_STEP) * BRIGHTNESS_STEP;
      setBrightness(Math.max(0, Math.min(100, pct)));
    } catch (e) {
      console.warn('[OperatorSettings] Could not read brightness:', e);
    }
  };

  const handleBrightnessChange = async (delta: number): Promise<void> => {
    const next = Math.max(0, Math.min(100, brightness + delta));
    setBrightness(next);
    try {
      await BrightnessModule.setBrightnessLevel(next / 100);
    } catch (e) {
      console.warn('[OperatorSettings] Could not set brightness:', e);
    }
  };

  const handleOpenWifi = async (): Promise<void> => {
    try {
      await KioskModule.stopLockTask();
    } catch (_) {}
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch (e) {
      Alert.alert('Cannot open WiFi settings', String(e));
    }
  };

  const handleOpenSound = async (): Promise<void> => {
    try {
      await KioskModule.stopLockTask();
    } catch (_) {}
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.SOUND_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch (e) {
      Alert.alert('Cannot open sound settings', String(e));
    }
  };

  const handleReturn = (): void => {
    revokeSettingsAccess();
    navigation.navigate('Kiosk');
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Venue Manager</Text>
        <TouchableOpacity style={styles.closeButton} onPress={handleReturn}>
          <Text style={styles.closeButtonText}>✕ Return to Kiosk</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* DISPLAY section */}
        <Text style={styles.sectionHeader}>DISPLAY</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Brightness</Text>
          <View style={styles.brightnessRow}>
            <TouchableOpacity
              style={[styles.stepButton, brightness <= 0 && styles.stepButtonDisabled]}
              onPress={() => handleBrightnessChange(-BRIGHTNESS_STEP)}
              disabled={brightness <= 0}
            >
              <Text style={styles.stepButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.brightnessValue}>{brightness}%</Text>
            <TouchableOpacity
              style={[styles.stepButton, brightness >= 100 && styles.stepButtonDisabled]}
              onPress={() => handleBrightnessChange(BRIGHTNESS_STEP)}
              disabled={brightness >= 100}
            >
              <Text style={styles.stepButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CONNECTIVITY section */}
        <Text style={styles.sectionHeader}>CONNECTIVITY</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenWifi}>
            <Text style={styles.actionButtonText}>WiFi Settings</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* SOUND section */}
        <Text style={styles.sectionHeader}>SOUND</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenSound}>
            <Text style={styles.actionButtonText}>Sound Settings</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Footer info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Admin access required for PIN changes, kiosk config, and device reset.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background ?? '#f4f4f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg ?? 20,
    paddingTop: (Spacing.xl ?? 24) + 8,
    paddingBottom: Spacing.md ?? 16,
    backgroundColor: Colors.surface ?? '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? '#e0e0e0',
  },
  headerTitle: {
    fontSize: Typography.sizes?.xl ?? 20,
    fontWeight: '700',
    color: Colors.text ?? '#1a1a1a',
  },
  closeButton: {
    paddingHorizontal: Spacing.md ?? 16,
    paddingVertical: Spacing.sm ?? 8,
    backgroundColor: Colors.primary ?? '#0066cc',
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: Typography.sizes?.sm ?? 14,
    fontWeight: '600',
  },
  content: {
    padding: Spacing.lg ?? 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: Typography.sizes?.xs ?? 12,
    fontWeight: '700',
    color: Colors.textSecondary ?? '#888888',
    letterSpacing: 1.2,
    marginTop: Spacing.lg ?? 20,
    marginBottom: Spacing.sm ?? 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.surface ?? '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border ?? '#e0e0e0',
    overflow: 'hidden',
  },
  cardLabel: {
    fontSize: Typography.sizes?.base ?? 16,
    fontWeight: '600',
    color: Colors.text ?? '#1a1a1a',
    paddingHorizontal: Spacing.lg ?? 20,
    paddingTop: Spacing.md ?? 16,
    paddingBottom: Spacing.sm ?? 8,
  },
  brightnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg ?? 20,
    paddingBottom: Spacing.md ?? 16,
    gap: Spacing.xl ?? 24,
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary ?? '#0066cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    backgroundColor: Colors.border ?? '#e0e0e0',
  },
  stepButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 28,
  },
  brightnessValue: {
    fontSize: Typography.sizes?.xl ?? 20,
    fontWeight: '700',
    color: Colors.text ?? '#1a1a1a',
    minWidth: 64,
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg ?? 20,
    paddingVertical: Spacing.md ?? 16,
  },
  actionButtonText: {
    fontSize: Typography.sizes?.base ?? 16,
    fontWeight: '500',
    color: Colors.primary ?? '#0066cc',
  },
  actionArrow: {
    fontSize: 22,
    color: Colors.textSecondary ?? '#888888',
  },
  infoBox: {
    marginTop: Spacing.xl ?? 24,
    padding: Spacing.md ?? 16,
    backgroundColor: '#fff8e1',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffe082',
  },
  infoText: {
    fontSize: Typography.sizes?.sm ?? 14,
    color: '#7a5f00',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default OperatorSettingsScreen;
