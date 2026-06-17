import { calculateCombinedCpuScore } from './cpuBenchmark';

export interface BenchmarkResult {
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
  gpuRenderer?: string;
  retention: number;
  singleCoreScore?: number;
  multiCoreScore?: number;
}

export function calculateScore(
  fpsArray: number[],
  batteryDrain: number,
  singleCoreScore: number = 0,
  multiCoreScore: number = 0,
  targetHz: number = 120,
): Omit<BenchmarkResult, 'fpsTimeline' | 'duration' | 'detectedHz'> & {
  fpsTimeline: { t: number; fps: number }[];
  duration: number;
  detectedHz: number;
} {
  if (fpsArray.length === 0) {
    return {
      avgFPS: 0, minFPS: 0, onePercentLow: 0, stability: 0,
      cpuScore: 0, gpuScore: 0, score: 0, tier: 'C',
      batteryDrain: 0, batteryEfficiency: 0,
      fpsTimeline: [], duration: 0, detectedHz: 60,
      retention: 100,
      singleCoreScore: 0,
      multiCoreScore: 0,
    };
  }

  const avg = fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length;
  const sorted = [...fpsArray].sort((a, b) => a - b);
  const minFPS = sorted[0];

  // 1% low
  const onePercentCount = Math.max(1, Math.floor(fpsArray.length * 0.01));
  const onePercentLow =
    sorted.slice(0, onePercentCount).reduce((a, b) => a + b, 0) / onePercentCount;

  // Stability via std deviation (% of mean)
  const variance = fpsArray.reduce((sum, fps) => sum + Math.pow(fps - avg, 2), 0) / fpsArray.length;
  const stdDev = Math.sqrt(variance);
  const stability = Math.max(0, Math.min(100, 100 * (1 - stdDev / Math.max(avg, 1))));

  // Performance retention (first 15% vs last 15% of samples)
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

  // GPU score: normalize avgFPS against targetHz (device's max refresh rate)
  const perfScore = Math.min(100, (avg / targetHz) * 100);
  const rawGpu = perfScore * 0.7 + stability * 0.3;
  const gpuScore = Math.min(100, rawGpu);

  // Combined CPU score from single-core and multi-core
  const cpuScore = calculateCombinedCpuScore(singleCoreScore, multiCoreScore);
  const finalCpuScore = Math.min(100, cpuScore);

  // Total: 65% GPU + 35% CPU
  const totalScore = Math.min(100, gpuScore * 0.65 + finalCpuScore * 0.35);

  const batteryEfficiency = batteryDrain > 0 ? avg / batteryDrain : avg;
  const tier = classifyTier(totalScore);

  return {
    avgFPS: r(avg), minFPS: r(minFPS), onePercentLow: r(onePercentLow),
    stability: r(stability), cpuScore: r(finalCpuScore), gpuScore: r(gpuScore),
    score: r(totalScore), tier, batteryDrain,
    batteryEfficiency: r(batteryEfficiency),
    fpsTimeline: [], duration: 0, detectedHz: 60,
    retention: r(retention),
    singleCoreScore: r(singleCoreScore),
    multiCoreScore: r(multiCoreScore),
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
