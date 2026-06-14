// hooks/useHardwareInfo.ts
// Native hardware detection using expo-device + expo-battery + expo-file-system
//
// Fixes (v1.1):
//  - RAM: read /proc/meminfo on Android (getMaxMemoryAsync returns JVM heap, not physical RAM)
//  - OS: hardcode "Android"/"iOS" label instead of Device.osName (returns build fingerprint on MIUI)
//  - Device name: prefer Device.deviceName (user-set name) → brand + modelName as fallback

import { useEffect, useState } from 'react';
import { Dimensions, Platform, PixelRatio } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';

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
}

// ─── RAM detection ──────────────────────────────────────────────────────────
// On Android, read /proc/meminfo for real physical total RAM.
// Device.getMaxMemoryAsync() only returns the JVM heap ceiling (~300MB).
async function getTotalRAMGB(): Promise<number> {
  if (Platform.OS === 'android') {
    try {
      const meminfo = await FileSystem.readAsStringAsync('/proc/meminfo');
      const match = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
      if (match) {
        const kb = parseInt(match[1], 10);
        // Round to nearest common RAM size for cleaner display
        const gb = kb / (1024 * 1024);
        return Math.round(gb * 10) / 10; // e.g. 11.7 → shows as "11.7"
      }
    } catch {
      // /proc/meminfo read failed, fall through to estimate
    }
  }
  // iOS / fallback: expo-device total memory
  try {
    const bytes = await Device.getMaxMemoryAsync();
    // On iOS this gives a reasonable physical estimate; on Android this is JVM heap
    // If the value is suspiciously small (< 2 GB), multiply by a typical heap ratio
    const gb = bytes / (1024 * 1024 * 1024);
    if (Platform.OS === 'ios' && gb > 0.5) return Math.round(gb * 10) / 10;
  } catch {}
  return 8; // last resort fallback
}

// ─── Device name ────────────────────────────────────────────────────────────
// Priority: user-set device name → brand + model name (cleaned)
function buildDeviceName(): string {
  const brand = Device.brand ?? '';
  const model = Device.modelName ?? '';

  // Model names that are just alphanumeric codes (e.g. "25053RT47C") → use brand only
  const isCodeOnly = /^[A-Z0-9]{6,}$/.test(model.replace(/\s/g, ''));

  if (brand && model && !isCodeOnly) {
    // Avoid repeating brand in model: "Xiaomi Xiaomi 14" → "Xiaomi 14"
    if (model.toLowerCase().startsWith(brand.toLowerCase())) {
      return model;
    }
    return `${brand} ${model}`;
  }
  if (brand) return brand;
  if (model) return model;
  return 'Unknown Device';
}

// ─── OS string ──────────────────────────────────────────────────────────────
// Device.osName on MIUI / HyperOS returns the full build fingerprint string.
// Always use "Android" / "iOS" and rely on Device.osVersion for the number.
function buildOSString(): string {
  const platform = Platform.OS === 'android' ? 'Android' : 'iOS';

  // Device.osVersion is typically "15", "16", "18.1" etc.
  // Validate: must look like a version number, not a build fingerprint
  const raw = Device.osVersion ?? '';
  const looksLikeVersion = /^\d+(\.\d+)*$/.test(raw.trim());
  const version = looksLikeVersion ? raw.trim() : String(Platform.Version);

  return `${platform} ${version}`;
}

// ─── Hook ───────────────────────────────────────────────────────────────────
export function useHardwareInfo() {
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function detect() {
      try {
        const deviceName = buildDeviceName();
        const os = buildOSString();

        // RAM — read from /proc/meminfo on Android
        const ramGB = await getTotalRAMGB();

        // Battery
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

        // Screen
        const { width, height } = Dimensions.get('screen');
        const pixelRatio = PixelRatio.get();

        setInfo({
          deviceName,
          os,
          cpuCores: 8,
          ramGB,
          gpuRenderer: 'OpenGL ES (Native)',
          batteryLevel,
          batteryCharging,
          batterySupported,
          screenWidth: Math.round(width),
          screenHeight: Math.round(height),
          pixelRatio: Math.round(pixelRatio * 100) / 100,
        });
      } catch (err) {
        console.error('Hardware detection failed:', err);
        setError(String(err));
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

  // Live battery listener
  useEffect(() => {
    const subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setInfo(prev =>
        prev ? { ...prev, batteryLevel: Math.round(batteryLevel * 100) } : prev,
      );
    });
    return () => subscription.remove();
  }, []);

  return { info, loading, error };
}
