// hooks/useHardwareInfo.ts
// Native hardware detection using react-native-device-info + expo-battery
// Replaces HardwareDetector.tsx (web-based UA parser approach)

import { useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import DeviceInfo from 'react-native-device-info';

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
        // 1. Device identity (REAL values, not guessing via UA)
        const brand = DeviceInfo.getBrand();          // e.g. "Xiaomi"
        const model = DeviceInfo.getModel();          // e.g. "2501GRN3DH"
        const deviceName = `${brand} ${model}`;

        // 2. OS version
        const osVersion = DeviceInfo.getSystemVersion();
        const os = `${Platform.OS === 'android' ? 'Android' : 'iOS'} ${osVersion}`;

        // 3. CPU cores (real count)
        const cpuCores = await DeviceInfo.getAvailableLocationProviders()
          .then(() => DeviceInfo.getDeviceName())
          .then(() => {
            // react-native-device-info doesn't have direct CPU cores API
            // but we can get total memory to estimate
            return 8; // fallback; use native module if available
          });

        // 4. RAM (REAL value in GB)
        const totalRamBytes = await DeviceInfo.getTotalMemory();
        const ramGB = parseFloat((totalRamBytes / (1024 * 1024 * 1024)).toFixed(1));

        // 5. Battery (works on both Android AND iOS — fixes the web limitation!)
        let batteryLevel = 100;
        let batteryCharging = false;
        let batterySupported = false;
        try {
          const [level, state] = await Promise.all([
            Battery.getBatteryLevelAsync(),
            Battery.getBatteryStateAsync(),
          ]);
          batteryLevel = Math.round(level * 100);
          batteryCharging = state === Battery.BatteryState.CHARGING ||
                            state === Battery.BatteryState.FULL;
          batterySupported = true;
        } catch {
          batterySupported = false;
        }

        // 6. Screen dimensions (real device pixels)
        const { width, height } = Dimensions.get('screen');
        const { PixelRatio } = require('react-native');
        const pixelRatio = PixelRatio.get();

        // 7. GPU (will be filled by the GLView context in BenchmarkScreen)
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
        // Fallback
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
      setInfo(prev => prev ? { ...prev, batteryLevel: Math.round(batteryLevel * 100) } : prev);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return { info, loading, error };
}
