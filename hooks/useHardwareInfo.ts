// hooks/useHardwareInfo.ts
// Native hardware detection using expo-device + expo-battery
// expo-device is maintained by Expo team → no Gradle conflicts

import { useEffect, useState } from 'react';
import { Dimensions, Platform, PixelRatio } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';

export interface HardwareInfo {
  deviceName: string;
  os: string;
  cpuCores: number;
  ramGB: number;
  gpuRenderer: string;
  batteryLevel: number;
  batteryCharging: boolean;
  batterySupported: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  thermalState?: string;
}

export function useHardwareInfo() {
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function detect() {
      try {
        // 1. Device identity via expo-device (no Gradle issues)
        const brand = Device.brand ?? 'Unknown';         // e.g. "Xiaomi"
        const model = Device.modelName ?? 'Device';     // e.g. "Redmi Turbo 4 Pro"
        const deviceName = `${brand} ${model}`;

        // 2. OS version
        const osVersion = Device.osVersion ?? '';
        const osName = Device.osName ?? (Platform.OS === 'android' ? 'Android' : 'iOS');
        const os = `${osName} ${osVersion}`.trim();

        // 3. CPU cores — expo-device doesn't expose directly, estimate from supportedCpuArchitectures
        // Use a reasonable default based on device class
        const cpuCores = 8; // expo-device does not expose CPU count

        // 4. RAM (REAL value in GB via expo-device)
        const totalRamBytes = await Device.getMaxMemoryAsync();
        const ramGB = totalRamBytes > 0
          ? parseFloat((totalRamBytes / (1024 * 1024 * 1024)).toFixed(1))
          : 8;

        // 5. Battery (works on both Android AND iOS!)
        let batteryLevel = 100;
        let batteryCharging = false;
        let batterySupported = false;
        try {
          const [level, state] = await Promise.all([
            Battery.getBatteryLevelAsync(),
            Battery.getBatteryStateAsync(),
          ]);
          batteryLevel = Math.round(level * 100);
          batteryCharging =
            state === Battery.BatteryState.CHARGING ||
            state === Battery.BatteryState.FULL;
          batterySupported = true;
        } catch {
          batterySupported = false;
        }

        // 6. Screen dimensions
        const { width, height } = Dimensions.get('screen');
        const pixelRatio = PixelRatio.get();

        // 7. GPU (filled by GLView context later)
        const gpuRenderer = 'OpenGL ES (Native)';

        const hardwareInfo: HardwareInfo = {
          deviceName,
          os,
          cpuCores,
          ramGB,
          gpuRenderer,
          batteryLevel,
          batteryCharging,
          batterySupported,
          screenWidth: Math.round(width),
          screenHeight: Math.round(height),
          pixelRatio,
        };

        setInfo(hardwareInfo);
      } catch (err) {
        console.error('Hardware detection failed:', err);
        setError(String(err));
        // Fallback values
        setInfo({
          deviceName: 'Unknown Device',
          os: Platform.OS === 'android' ? 'Android' : 'iOS',
          cpuCores: 8,
          ramGB: 8,
          gpuRenderer: 'Unknown GPU',
          batteryLevel: 100,
          batteryCharging: false,
          batterySupported: false,
          screenWidth: 390,
          screenHeight: 844,
          pixelRatio: 3,
        });
      } finally {
        setLoading(false);
      }
    }

    detect();
  }, []);

  // Live battery level listener
  useEffect(() => {
    const subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setInfo(prev =>
        prev ? { ...prev, batteryLevel: Math.round(batteryLevel * 100) } : prev,
      );
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return { info, loading, error };
}
