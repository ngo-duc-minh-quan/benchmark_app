// lib/api.ts
// API client for BenchmarkX Native
// Connects to the Next.js backend (benchmark-tool) running on Vercel or local server

import axios, { AxiosError } from 'axios';
import * as FileSystem from 'expo-file-system';
import { BenchmarkResult } from './scoreCalculator';
import { HardwareInfo } from '../hooks/useHardwareInfo';

// ─── Config ────────────────────────────────────────────────────────────────
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  process.env.EXPO_PUBLIC_API_URL_LOCAL ??
  'http://localhost:3000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ─── Types ──────────────────────────────────────────────────────────────────
export interface SaveResultPayload {
  clientResultId: string;
  deviceName: string;
  os: string;
  browser: string;       // "BenchmarkX Native Android" hoặc "BenchmarkX Native iOS"
  cpuCores: number;
  ramGB: number;
  gpuRenderer: string;
  avgFPS: number;
  minFPS: number;
  onePercentLow: number;
  cpuScore: number;
  gpuScore: number;
  score: number;
  tier: 'S' | 'A' | 'B' | 'C';
  batteryDrain: number;
  fpsTimeline: { t: number; fps: number }[];
  /** true nếu bị Android Adaptive Refresh Rate khóa FPS ở 60Hz */
  is60HzLocked?: boolean;
  /** Tần số quét thực tế dùng để tính điểm */
  effectiveTargetHz?: number;
  singleCoreWorkUnitsPerSec?: number;
  multiCoreWorkUnitsPerSec?: number;
}

export interface SaveResultResponse {
  success: boolean;
  id: number;
}

export interface LeaderboardEntry {
  id: number;
  deviceName: string;
  os: string;
  browser: string;
  avgFPS: number;
  onePercentLow: number;
  score: number;
  tier: string;
  batteryDrain: number;
  createdAt: string;
}

export interface LeaderboardResponse {
  success: boolean;
  entries: LeaderboardEntry[];
  error?: string;
}

// ─── Offline Queue Functions ────────────────────────────────────────────────
const OFFLINE_QUEUE_PATH = ((FileSystem as any).documentDirectory || '') + 'offline_queue.json';

export async function getOfflineQueue(): Promise<SaveResultPayload[]> {
  try {
    const info = await FileSystem.getInfoAsync(OFFLINE_QUEUE_PATH);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(OFFLINE_QUEUE_PATH);
    return JSON.parse(content) || [];
  } catch (e) {
    console.error('[OfflineQueue] Failed to read queue:', e);
    return [];
  }
}

export async function saveOfflineQueue(queue: SaveResultPayload[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(OFFLINE_QUEUE_PATH, JSON.stringify(queue));
  } catch (e) {
    console.error('[OfflineQueue] Failed to save queue:', e);
  }
}

export async function addToOfflineQueue(payload: SaveResultPayload): Promise<void> {
  try {
    const queue = await getOfflineQueue();
    // Avoid duplicate payload in queue by clientResultId
    const exists = queue.some(p => p.clientResultId === payload.clientResultId);
    if (!exists) {
      queue.push(payload);
      await saveOfflineQueue(queue);
      console.log('[OfflineQueue] Added result to offline queue. Total in queue:', queue.length);
    }
  } catch (e) {
    console.error('[OfflineQueue] Failed to add to queue:', e);
  }
}

export async function syncOfflineQueue(): Promise<{ success: boolean; syncedCount: number }> {
  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) return { success: true, syncedCount: 0 };

    console.log('[OfflineQueue] Attempting to sync queue of size:', queue.length);
    const remainingQueue: SaveResultPayload[] = [];
    let syncedCount = 0;

    for (const payload of queue) {
      try {
        await api.post('/api/results', payload);
        syncedCount++;
      } catch (err) {
        console.error('[OfflineQueue] Sync failed for payload, keeping in queue:', err);
        remainingQueue.push(payload);
      }
    }

    await saveOfflineQueue(remainingQueue);
    return { success: remainingQueue.length === 0, syncedCount };
  } catch (e) {
    console.error('[OfflineQueue] Sync process failed:', e);
    return { success: false, syncedCount: 0 };
  }
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * POST /api/results — Lưu kết quả benchmark lên server
 */
export async function saveResultToServer(
  result: BenchmarkResult,
  hardware: HardwareInfo,
): Promise<{ success: boolean; id?: number; error?: string; isOffline?: boolean }> {
  const payload: SaveResultPayload = {
    clientResultId: result.clientResultId,
    deviceName: hardware.deviceName,
    os: hardware.os,
    browser: `BenchmarkX Native v2 (${hardware.os.includes('Android') ? 'Android' : 'iOS'}) (SC: ${result.singleCoreScore || 0}, MC: ${result.multiCoreScore || 0})`,
    cpuCores: hardware.cpuCores,
    ramGB: hardware.ramGB,
    gpuRenderer: result.gpuRenderer || hardware.gpuRenderer,
    avgFPS: result.avgFPS,
    minFPS: result.minFPS,
    onePercentLow: result.onePercentLow,
    cpuScore: result.cpuScore,
    gpuScore: result.gpuScore,
    score: result.score,
    tier: result.tier,
    batteryDrain: result.batteryDrain,
    fpsTimeline: result.fpsTimeline,
    is60HzLocked: result.is60HzLocked,
    effectiveTargetHz: result.effectiveTargetHz,
    singleCoreWorkUnitsPerSec: result.singleCoreWorkUnitsPerSec,
    multiCoreWorkUnitsPerSec: result.multiCoreWorkUnitsPerSec,
  };

  try {
    const response = await api.post<SaveResultResponse>('/api/results', payload);
    return { success: true, id: response.data.id };
  } catch (err) {
    const error = err as AxiosError<{ error: string }>;
    const message =
      error.response?.data?.error ??
      (error.code === 'ECONNABORTED' ? 'Server timeout (8s)' : 'Connection failed');
    console.error('[API] saveResult failed:', message);
    
    // Save to offline queue
    await addToOfflineQueue(payload);
    return { success: false, error: message, isOffline: true };
  }
}

/**
 * GET /api/results — Lấy top 50 kết quả từ server (live leaderboard)
 */
export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  try {
    const response = await api.get<{ results: LeaderboardEntry[] }>('/api/results');
    return {
      success: true,
      entries: response.data.results ?? [],
    };
  } catch (err) {
    const error = err as AxiosError<{ error: string }>;
    console.error('[API] fetchLeaderboard failed:', err);
    return {
      success: false,
      entries: [],
      error: error.message || 'Failed to connect to server',
    };
  }
}

/**
 * Kiểm tra xem server có online không
 */
export async function pingServer(): Promise<boolean> {
  try {
    await api.get('/api/results', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
