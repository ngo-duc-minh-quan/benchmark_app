// lib/api.ts
// API client for BenchmarkX Native
// Connects to the Next.js backend (benchmark-tool) running on Vercel or local server

import axios, { AxiosError } from 'axios';
import { BenchmarkResult } from './scoreCalculator';
import { HardwareInfo } from '../hooks/useHardwareInfo';

// ─── Config ────────────────────────────────────────────────────────────────
// Update BASE_URL khi deploy Next.js lên Vercel:
//   1. Tạo file .env trong benchmarkx-app/
//   2. Thêm: EXPO_PUBLIC_API_URL=https://your-app.vercel.app
// Khi chạy local: Next.js phải đang chạy trên port 3000

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
}

export interface SaveResultResponse {
  success: boolean;
  id: number;
}

export interface LeaderboardEntry {
  id: number;
  deviceName: string;
  os: string;
  avgFPS: number;
  onePercentLow: number;
  score: number;
  tier: string;
  batteryDrain: number;
  createdAt: string;
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * POST /api/results — Lưu kết quả benchmark lên server
 */
export async function saveResultToServer(
  result: BenchmarkResult,
  hardware: HardwareInfo,
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const payload: SaveResultPayload = {
      deviceName: hardware.deviceName,
      os: hardware.os,
      browser: `BenchmarkX Native (${hardware.os.includes('Android') ? 'Android' : 'iOS'})`,
      cpuCores: hardware.cpuCores,
      ramGB: hardware.ramGB,
      gpuRenderer: hardware.gpuRenderer,
      avgFPS: result.avgFPS,
      minFPS: result.minFPS,
      onePercentLow: result.onePercentLow,
      cpuScore: result.cpuScore,
      gpuScore: result.gpuScore,
      score: result.score,
      tier: result.tier,
      batteryDrain: result.batteryDrain,
      fpsTimeline: result.fpsTimeline,
    };

    const response = await api.post<SaveResultResponse>('/api/results', payload);
    return { success: true, id: response.data.id };
  } catch (err) {
    const error = err as AxiosError<{ error: string }>;
    const message =
      error.response?.data?.error ??
      (error.code === 'ECONNABORTED' ? 'Server timeout (8s)' : 'Connection failed');
    console.error('[API] saveResult failed:', message);
    return { success: false, error: message };
  }
}

/**
 * GET /api/results — Lấy top 50 kết quả từ server (live leaderboard)
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const response = await api.get<{ results: LeaderboardEntry[] }>('/api/results');
    return response.data.results ?? [];
  } catch (err) {
    console.error('[API] fetchLeaderboard failed:', err);
    return []; // fallback to local baselines
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
