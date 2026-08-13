import { calculateCombinedCpuScore } from './cpuBenchmark';

export interface BenchmarkResult {
  clientResultId: string;
  avgFPS: number;
  minFPS: number;
  onePercentLow: number;
  stability: number;
  cpuScore: number;
  gpuScore: number;
  score: number;
  tier: 'S' | 'A' | 'B' | 'C';
  batteryDrain: number;
  batteryEfficiency: number;
  fpsTimeline: { t: number; fps: number }[];
  duration: number;
  detectedHz: number;
  /** Tần số quét hiệu quả thực tế dùng để hiển thị */
  effectiveTargetHz: number;
  /** true nếu phát hiện thiết bị có thể bị khóa 60Hz do Adaptive Refresh Rate */
  is60HzLocked: boolean;
  gpuRenderer?: string;
  retention: number;
  singleCoreScore?: number;
  multiCoreScore?: number;
  singleCoreWorkUnitsPerSec?: number;
  multiCoreWorkUnitsPerSec?: number;
  cpuCoresUsed?: number;
}

/**
 * Phát hiện thiết bị có thể bị Android khóa tần số quét xuống 60Hz dù màn hình hỗ trợ 120Hz.
 * Xảy ra do cơ chế "Adaptive Refresh Rate" tiết kiệm pin khi không có tương tác chạm.
 */
function detectPossible60HzLock(
  fpsArray: number[],
  targetHz: number,
): boolean {
  if (targetHz < 90 || fpsArray.length === 0) {
    return false;
  }

  const avg = fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length;

  const variance =
    fpsArray.reduce((sum, fps) => sum + Math.pow(fps - avg, 2), 0) /
    fpsArray.length;

  const stdDev = Math.sqrt(variance);

  return avg >= 55 && avg <= 67 && stdDev <= 8;
}

export function calculateScore(
  fpsArray: number[],
  frameTimesMs: number[],
  batteryDrain: number,
  singleCoreScore: number = 0,
  multiCoreScore: number = 0,
  targetHz: number = 120,
  singleCoreWups: number = 0,
  multiCoreWups: number = 0,
  cpuCoresUsed: number = 0,
  clientResultId?: string,
): BenchmarkResult {
  const resultId = clientResultId ?? `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  if (fpsArray.length === 0 && frameTimesMs.length === 0) {
    return {
      clientResultId: resultId,
      avgFPS: 0, minFPS: 0, onePercentLow: 0, stability: 0,
      cpuScore: 0, gpuScore: 0, score: 0, tier: 'C',
      batteryDrain: 0, batteryEfficiency: 0,
      fpsTimeline: [], duration: 0, detectedHz: 60,
      effectiveTargetHz: targetHz,
      is60HzLocked: false,
      retention: 100,
      singleCoreScore: 0,
      multiCoreScore: 0,
      singleCoreWorkUnitsPerSec: 0,
      multiCoreWorkUnitsPerSec: 0,
      cpuCoresUsed: 0,
    };
  }

  const validFrameTimes = frameTimesMs.filter(
    ms => Number.isFinite(ms) && ms > 0
  );

  let avg = 0;
  let minFPS = 0;
  let onePercentLow = 0;
  let stability = 0;

  if (validFrameTimes.length > 0) {
    // Average FPS = tổng số frame / tổng thời gian
    const avgFrameTime =
      validFrameTimes.reduce((sum, ms) => sum + ms, 0) /
      validFrameTimes.length;

    avg = 1000 / avgFrameTime;

    // Worst individual frame
    const worstFrameTime = Math.max(...validFrameTimes);
    minFPS = 1000 / worstFrameTime;

    // 1% Low: lấy 1% frame-time tệ nhất rồi chuyển ngược thành FPS
    const worstFrameTimes = [...validFrameTimes].sort((a, b) => b - a);
    const worstCount = Math.max(1, Math.ceil(worstFrameTimes.length * 0.01));
    const worstAverageMs =
      worstFrameTimes.slice(0, worstCount).reduce((sum, ms) => sum + ms, 0) /
      worstCount;

    onePercentLow = 1000 / worstAverageMs;

    // Frame-time consistency
    const variance =
      validFrameTimes.reduce(
        (sum, ms) => sum + Math.pow(ms - avgFrameTime, 2),
        0,
      ) / validFrameTimes.length;

    const stdDev = Math.sqrt(variance);

    stability = Math.max(
      0,
      Math.min(100, 100 * (1 - stdDev / Math.max(avgFrameTime, 0.001))),
    );
  } else if (fpsArray.length > 0) {
    // Fallback nếu không có frameTimesMs (chỉ dùng fpsArray sample)
    avg = fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length;
    const sorted = [...fpsArray].sort((a, b) => a - b);
    minFPS = sorted[0];
    const onePercentCount = Math.max(1, Math.floor(fpsArray.length * 0.01));
    onePercentLow =
      sorted.slice(0, onePercentCount).reduce((a, b) => a + b, 0) /
      onePercentCount;
    const variance =
      fpsArray.reduce((sum, fps) => sum + Math.pow(fps - avg, 2), 0) /
      fpsArray.length;
    const stdDev = Math.sqrt(variance);
    stability = Math.max(0, Math.min(100, 100 * (1 - stdDev / Math.max(avg, 1))));
  }

  // Performance retention (first 15% vs last 15% of 500ms samples)
  let retention = 100;
  if (fpsArray.length >= 10) {
    const sampleSize = Math.max(2, Math.floor(fpsArray.length * 0.15));
    const firstSamples = fpsArray.slice(0, sampleSize);
    const lastSamples = fpsArray.slice(-sampleSize);
    const firstAvg = firstSamples.reduce((a, b) => a + b, 0) / sampleSize;
    const lastAvg = lastSamples.reduce((a, b) => a + b, 0) / sampleSize;
    if (firstAvg > 0) {
      retention = Math.max(0, Math.min(100, (lastAvg / firstAvg) * 100));
    }
  }

  // Phát hiện 60Hz lock (chỉ dùng hiển thị banner, KHÔNG dùng làm mẫu số nắn điểm)
  const is60HzLocked = detectPossible60HzLock(fpsArray, targetHz);
  const effectiveTargetHz = is60HzLocked ? 60 : targetHz;

  // Graphics Score Formula:
  // 55% Sustained FPS + 25% 1% Low + 10% Stability + 10% Retention (so với COMMON_TARGET_FPS = 60)
  const COMMON_TARGET_FPS = 60;
  const perfScore = Math.min(100, (avg / COMMON_TARGET_FPS) * 100);
  const lowScore = Math.min(100, (onePercentLow / COMMON_TARGET_FPS) * 100);

  const rawGpu =
    perfScore * 0.55 +
    lowScore * 0.25 +
    stability * 0.10 +
    retention * 0.10;

  const gpuScore = Math.min(100, rawGpu);

  // Combined CPU score from single-core and multi-core
  const cpuScore = calculateCombinedCpuScore(singleCoreScore, multiCoreScore);
  const finalCpuScore = Math.min(100, cpuScore);

  // Total: 65% GPU (Graphics) + 35% CPU
  const totalScore = Math.min(100, gpuScore * 0.65 + finalCpuScore * 0.35);

  const batteryEfficiency = batteryDrain > 0 ? avg / batteryDrain : 0;
  const tier = classifyTier(totalScore);

  return {
    clientResultId: resultId,
    avgFPS: r(avg), minFPS: r(minFPS), onePercentLow: r(onePercentLow),
    stability: r(stability), cpuScore: r(finalCpuScore), gpuScore: r(gpuScore),
    score: r(totalScore), tier, batteryDrain,
    batteryEfficiency: r(batteryEfficiency),
    fpsTimeline: [], duration: 0, detectedHz: 60,
    effectiveTargetHz,
    is60HzLocked,
    retention: r(retention),
    singleCoreScore: r(singleCoreScore),
    multiCoreScore: r(multiCoreScore),
    singleCoreWorkUnitsPerSec: r(singleCoreWups),
    multiCoreWorkUnitsPerSec: r(multiCoreWups),
    cpuCoresUsed,
  };
}

function r(n: number) { return Math.round(n * 10) / 10; }

export function classifyTier(score: number): 'S' | 'A' | 'B' | 'C' {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  return 'C';
}

export const tierConfig = {
  S: { label: 'S-Tier', color: '#FFD700', desc: 'Flagship Killer — Pro Gaming Grade' },
  A: { label: 'A-Tier', color: '#00E676', desc: 'Excellent — Competitive Gaming' },
  B: { label: 'B-Tier', color: '#00D4FF', desc: 'Good — Smooth Everyday Gaming' },
  C: { label: 'C-Tier', color: '#9E9E9E', desc: 'Average — Casual Gaming Only' },
};
