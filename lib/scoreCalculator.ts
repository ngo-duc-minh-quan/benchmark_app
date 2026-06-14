// lib/scoreCalculator.ts
// Ported from web version — works directly in React Native (no Web Worker needed)
// Use react-native-worklets-core or run in background thread for heavy computations

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
}

export function calculateScore(
  fpsArray: number[],
  batteryDrain: number,
  cpuScore: number = 0,
): BenchmarkResult {
  if (fpsArray.length === 0) {
    return {
      avgFPS: 0, minFPS: 0, onePercentLow: 0, stability: 0,
      cpuScore: 0, gpuScore: 0, score: 0, tier: 'C',
      batteryDrain: 0, batteryEfficiency: 0,
      fpsTimeline: [], duration: 0, detectedHz: 60,
    };
  }

  const avg = fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length;
  const sorted = [...fpsArray].sort((a, b) => a - b);
  const minFPS = sorted[0];

  // 1% low
  const onePercentCount = Math.max(1, Math.floor(fpsArray.length * 0.01));
  const onePercentLow =
    sorted.slice(0, onePercentCount).reduce((a, b) => a + b, 0) / onePercentCount;

  // Stability via std deviation
  const variance = fpsArray.reduce((sum, fps) => sum + Math.pow(fps - avg, 2), 0) / fpsArray.length;
  const stdDev = Math.sqrt(variance);
  const stability = Math.max(0, Math.min(100, 100 * (1 - stdDev / Math.max(avg, 1))));

  // GPU score: 120 FPS + 100 stability = perfect = 112 raw
  const rawGpu = avg * 0.6 + stability * 0.4;
  const gpuScore = Math.min(100, (rawGpu / 112) * 100);

  // Total score: 60% GPU + 40% CPU
  const finalCpuScore = Math.min(100, cpuScore);
  const totalScore = Math.min(100, gpuScore * 0.6 + finalCpuScore * 0.4);

  const batteryEfficiency = batteryDrain > 0 ? avg / batteryDrain : avg;
  const tier = classifyTier(totalScore);

  return {
    avgFPS: r(avg), minFPS: r(minFPS), onePercentLow: r(onePercentLow),
    stability: r(stability), cpuScore: r(finalCpuScore), gpuScore: r(gpuScore),
    score: r(totalScore), tier, batteryDrain, batteryEfficiency: r(batteryEfficiency),
    fpsTimeline: [], duration: 0, detectedHz: 60,
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
