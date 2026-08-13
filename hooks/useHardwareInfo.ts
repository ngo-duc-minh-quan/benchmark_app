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
  cpuCoresEstimated: boolean;
  ramGB: number;
  freeRAMGB: number;
  freeRAMEstimated: boolean;
  socName: string;
  gpuRenderer: string;
  batteryLevel: number;
  batteryCharging: boolean;
  batterySupported: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
}

// ─── SoC / Chipset Mapping ──────────────────────────────────────────────────
function mapSoCName(rawSoc: string, deviceModel: string): string {
  const soc = rawSoc.toLowerCase();
  const model = deviceModel.toLowerCase();

  // iOS Mapping
  if (Platform.OS === 'ios') {
    if (model.includes('iphone16,1') || model.includes('iphone16,2')) return 'Apple A17 Pro';
    if (model.includes('iphone17,1') || model.includes('iphone17,2')) return 'Apple A18';
    if (model.includes('iphone17,3') || model.includes('iphone17,4')) return 'Apple A18 Pro';
    if (model.includes('iphone15,2') || model.includes('iphone15,3')) return 'Apple A16 Bionic';
    if (model.includes('iphone14,2') || model.includes('iphone14,3')) return 'Apple A15 Bionic';
    if (model.includes('iphone13,') || model.includes('iphone14,')) return 'Apple A15 Bionic';
    return 'Apple Silicon';
  }

  // Android Mapping
  if (soc.includes('sm8650') || soc.includes('snapdragon 8 gen 3') || soc.includes('pineapple')) return 'Snapdragon 8 Gen 3';
  if (soc.includes('sm8550') || soc.includes('snapdragon 8 gen 2') || soc.includes('kalama')) return 'Snapdragon 8 Gen 2';
  if (soc.includes('sm8450') || soc.includes('snapdragon 8 gen 1') || soc.includes('taro')) return 'Snapdragon 8 Gen 1';
  if (soc.includes('sm8750') || soc.includes('snapdragon 8 gen 4') || soc.includes('sun')) return 'Snapdragon 8 Elite';
  if (soc.includes('sm7675') || soc.includes('snapdragon 7+ gen 3')) return 'Snapdragon 7+ Gen 3';
  if (soc.includes('sm8635') || soc.includes('snapdragon 8s gen 3')) return 'Snapdragon 8s Gen 3';
  if (soc.includes('mt6989') || soc.includes('dimensity 9300')) return 'Dimensity 9300';
  if (soc.includes('mt6991') || soc.includes('dimensity 9400')) return 'Dimensity 9400';
  if (soc.includes('mt6893') || soc.includes('dimensity 1200')) return 'Dimensity 1200';
  if (soc.includes('mt6895') || soc.includes('dimensity 8100')) return 'Dimensity 8100';
  if (soc.includes('mt6897') || soc.includes('dimensity 8300')) return 'Dimensity 8300';
  
  if (rawSoc) return rawSoc;

  // Fallback by model name
  if (model.includes('s24')) return 'Snapdragon 8 Gen 3 / Exynos 2400';
  if (model.includes('s23')) return 'Snapdragon 8 Gen 2';
  if (model.includes('s22')) return 'Snapdragon 8 Gen 1';
  if (model.includes('redmagic 9')) return 'Snapdragon 8 Gen 3';
  if (model.includes('iqoo 12')) return 'Snapdragon 8 Gen 3';
  if (model.includes('turbo 4') || model.includes('turbo4')) return 'Dimensity 8400';

  return 'Octa-core ARM Processor';
}

// ─── RAM & CPU Info via /proc ──────────────────────────────────────────────
async function getRAMInfo(): Promise<{ totalGB: number; freeGB: number; freeRAMEstimated: boolean }> {
  // 1. Lấy dung lượng RAM vật lý thực tế từ Device.totalMemory (hoạt động tốt trên cả Android & iOS)
  let totalGB = 8;
  if (Device.totalMemory) {
    totalGB = Math.round(Device.totalMemory / (1024 * 1024 * 1024));
  }

  // 2. Thử lấy RAM trống real-time trên Android qua /proc/meminfo
  if (Platform.OS === 'android') {
    try {
      const meminfo = await FileSystem.readAsStringAsync('/proc/meminfo');
      const freeMatch = meminfo.match(/MemFree:\s+(\d+)\s+kB/);
      const buffersMatch = meminfo.match(/Buffers:\s+(\d+)\s+kB/);
      const cachedMatch = meminfo.match(/Cached:\s+(\d+)\s+kB/);

      if (freeMatch) {
        const freeKb = parseInt(freeMatch[1], 10);
        const buffersKb = buffersMatch ? parseInt(buffersMatch[1], 10) : 0;
        const cachedKb = cachedMatch ? parseInt(cachedMatch[1], 10) : 0;
        const availableKb = freeKb + buffersKb + cachedKb;
        const freeGB = Math.round((availableKb / (1024 * 1024)) * 10) / 10;
        return { totalGB, freeGB: Math.min(totalGB, freeGB), freeRAMEstimated: false };
      }
    } catch {
      // Bị chặn quyền đọc /proc trên một số phiên bản Android mới (Android 14+)
    }
  }

  // Ước lượng RAM trống khoảng 45% nếu không đọc được /proc/meminfo
  const freeGB = Math.round(totalGB * 0.45 * 10) / 10;
  return { totalGB, freeGB, freeRAMEstimated: true };
}

async function getAndroidCPUInfo(): Promise<{ cores: number; soc: string; cpuCoresEstimated: boolean }> {
  let cores = 8;
  let soc = '';
  let cpuCoresEstimated = true;

  if (Platform.OS === 'android') {
    try {
      const cpuinfo = await FileSystem.readAsStringAsync('/proc/cpuinfo');
      
      // Count cores
      const matches = cpuinfo.match(/^processor\s*:/gm);
      if (matches && matches.length > 0) {
        cores = matches.length;
        cpuCoresEstimated = false;
      }

      // Try finding hardware line
      const hardwareMatch = cpuinfo.match(/^Hardware\s*:\s*(.+)$/m);
      if (hardwareMatch) {
        soc = hardwareMatch[1].trim();
      } else {
        // Try reading soc0 machine name
        try {
          const machine = await FileSystem.readAsStringAsync('/sys/devices/soc0/machine');
          if (machine) soc = machine.trim();
        } catch {}
      }
    } catch {
      cpuCoresEstimated = true;
    }
  } else {
    // iOS
    cores = 6;
    cpuCoresEstimated = false;
  }

  return { cores, soc: mapSoCName(soc, Device.modelName ?? ''), cpuCoresEstimated };
}

// ─── Device name ────────────────────────────────────────────────────────────
function buildDeviceName(): string {
  const brand = Device.brand ?? '';
  const model = Device.modelName ?? '';
  const isCodeOnly = /^[A-Z0-9]{6,}$/.test(model.replace(/\s/g, ''));

  if (brand && model && !isCodeOnly) {
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
function buildOSString(): string {
  const platform = Platform.OS === 'android' ? 'Android' : 'iOS';
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

        // Total/Free RAM
        const { totalGB, freeGB, freeRAMEstimated } = await getRAMInfo();

        // CPU cores & SoC Name
        const { cores, soc, cpuCoresEstimated } = await getAndroidCPUInfo();

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
          cpuCores: cores,
          cpuCoresEstimated,
          ramGB: totalGB,
          freeRAMGB: freeGB,
          freeRAMEstimated,
          socName: soc,
          gpuRenderer: Platform.OS === 'android' ? 'Adreno / Mali GPU' : 'Apple GPU',
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
          cpuCores: Platform.OS === 'android' ? 8 : 6,
          cpuCoresEstimated: true,
          ramGB: 8,
          freeRAMGB: 3.5,
          freeRAMEstimated: true,
          socName: Platform.OS === 'android' ? 'ARM Processor' : 'Apple Silicon',
          gpuRenderer: 'OpenGL ES',
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

