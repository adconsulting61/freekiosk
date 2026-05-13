import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { revokeLocationAccess, hasLocationAccess } from '../utils/authState';
import BrightnessModule from '../utils/BrightnessModule';
import KioskModule from '../utils/KioskModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type LocationSettingsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'LocationSettings'>;

interface LocationSettingsScreenProps {
  navigation: LocationSettingsNavigationProp;
}

const LocationSettingsScreen: React.FC<LocationSettingsScreenProps> = ({ navigation }) => {
  const [brightness, setBrightness] = useState<number>(0.5);
  const [brightnessLoading, setBrightnessLoading] = useState<boolean>(true);
  const [rebooting, setRebooting] = useState<boolean>(false);

  useEffect(() => {
    if (!hasLocationAccess()) {
      navigation.navigate('Kiosk');
      return;
    }
    loadBrightness();
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => backHandler.remove();
  }, [navigation]);

  const loadBrightness = async (): Promise<void> => {
    try {
      const level = await BrightnessModule.getBrightnessLevel();
      setBrightness(level);
    } catch {
      // ignore — slider stays at default
    } finally {
      setBrightnessLoading(false);
    }
  };

  const handleBrightnessChange = async (value: number): Promise<void> => {
    setBrightness(value);
    try {
      await BrightnessModule.setBrightnessLevel(value);
    } catch {
      // non-fatal
    }
  };

  const handleOpenWifi = async (): Promise<void> => {
    try {
      await KioskModule.openAndroidSettings('wifi');
    } catch {
      Alert.alert('Error', 'Could not open Wi-Fi settings.');
    }
  };

  const handleRestart = (): void => {
    Alert.alert(
      'Restart Device',
      'This will reboot the device. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: async () => {
            setRebooting(true);
            try {
              await KioskModule.reboot();
            } catch {
              setRebooting(false);
              Alert.alert('Error', 'Could not restart. Device Owner permission may be required.');
            }
          },
        },
      ]
    );
  };

  const handleClose = useCallback((): void => {
    revokeLocationAccess();
    navigation.navigate('Kiosk');
  }, [navigation]);

  if (rebooting) {
    return (
      <View style={styles.rebootContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.rebootText}>Restarting…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Location Settings</Text>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>✕ Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Wi-Fi */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Wi-Fi</Text>
          <Text style={styles.cardHint}>Open Android Wi-Fi settings to connect to a network.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleOpenWifi}>
            <Text style={styles.primaryButtonText}>Open Wi-Fi Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Brightness */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Screen Brightness</Text>
          {brightnessLoading ? (
            <ActivityIndicator color="#0066cc" style={{ marginTop: 12 }} />
          ) : (
            <>
              <Text style={styles.cardHint}>{Math.round(brightness * 100)}%</Text>
              <Slider
                style={styles.slider}
                minimumValue={0.05}
                maximumValue={1}
                value={brightness}
                onValueChange={handleBrightnessChange}
                minimumTrackTintColor="#0066cc"
                maximumTrackTintColor="#ccc"
                thumbTintColor="#0066cc"
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Dim</Text>
                <Text style={styles.sliderLabel}>Bright</Text>
              </View>
            </>
          )}
        </View>

        {/* Restart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Restart Device</Text>
          <Text style={styles.cardHint}>Reboot the device. Requires Device Owner permission.</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleRestart}>
            <Text style={styles.dangerButtonText}>Restart Device</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0066cc',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  cardHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#999',
  },
  rebootContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  rebootText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default LocationSettingsScreen;
