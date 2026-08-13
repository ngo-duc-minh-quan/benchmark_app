// lib/cpuBenchmark.ts
// Native CPU benchmark — chạy thuật toán prime sieve + matrix math trên JS thread
// Khái niệm Work Unit: 1 Work Unit = 1x primeSieve(500,000) + 1x matMul(100)
// Giúp Single-Core và Multi-Core hoàn toàn đồng nhất đơn vị công việc (workUnits)

export interface CPUBenchmarkResult {
  ops: number;   // number of workUnits completed
  score: number; // 0-100 normalized
  durationMs: number;
}

/**
 * Sieve of Eratosthenes — tìm số nguyên tố đến N (500,000)
 */
function primeSieve(limit: number): number {
  const sieve = new Uint8Array(limit + 1).fill(1);
  sieve[0] = 0;
  sieve[1] = 0;
  
  for (let i = 2; i * i <= limit; i++) {
    if (sieve[i]) {
      for (let j = i * i; j <= limit; j += i) {
        sieve[j] = 0;
      }
    }
  }

  let count = 0;
  for (let i = 2; i <= limit; i++) {
    if (sieve[i]) count++;
  }
  return count;
}

/**
 * Matrix multiplication — test FPU + memory bandwidth
 * Dùng dữ liệu deterministic (thay vì Math.random) để đếm phép tính ổn định
 */
function matMul(size: number): number {
  const a = new Float64Array(size * size);
  const b = new Float64Array(size * size);
  const c = new Float64Array(size * size);

  for (let i = 0; i < size * size; i++) {
    a[i] = ((i * 17) % 100) / 100;
    b[i] = ((i * 31) % 100) / 100;
  }

  for (let i = 0; i < size; i++) {
    for (let k = 0; k < size; k++) {
      const aik = a[i * size + k];
      for (let j = 0; j < size; j++) {
        c[i * size + j] += aik * b[k * size + j];
      }
    }
  }
  return c[0];
}

/**
 * 1 Work Unit = 1x Prime Sieve + 1x Matrix Multiplication
 */
function runWorkUnit(): number {
  const primes = primeSieve(500_000);
  const matrix = matMul(100);
  return primes + matrix;
}

/**
 * Provisional baseline (workUnits/sec) pending real device empirical calibration.
 * Temporary baseline pending multi-device benchmark data collection.
 */
export const PROVISIONAL_SINGLE_CORE_BASELINE = 40;

/**
 * Normalize Single-Core CPU Score (0-100)
 */
export function normalizeSingleCoreScore(workUnits: number, durationMs: number): number {
  const workUnitsPerSecond = workUnits / (durationMs / 1000);
  const score = Math.min(100, (workUnitsPerSecond / PROVISIONAL_SINGLE_CORE_BASELINE) * 100);
  return Math.round(score * 10) / 10;
}

/**
 * Normalize Multi-Core CPU Score (0-100)
 */
export function normalizeMultiCoreScore(workUnits: number, durationMs: number, cores: number): number {
  const workUnitsPerSecond = workUnits / (durationMs / 1000);
  const scalingFactor = Math.max(1, cores * 0.7);
  const targetWorkUnitsPerSecond = PROVISIONAL_SINGLE_CORE_BASELINE * scalingFactor;
  const score = Math.min(100, (workUnitsPerSecond / targetWorkUnitsPerSecond) * 100);
  return Math.round(score * 10) / 10;
}

/**
 * Combined CPU Score: 40% Single-Core + 60% Multi-Core
 */
export function calculateCombinedCpuScore(singleCoreScore: number, multiCoreScore: number): number {
  return Math.round((singleCoreScore * 0.4 + multiCoreScore * 0.6) * 10) / 10;
}

/**
 * Run Single-Core CPU benchmark for `durationMs` milliseconds
 * Returns normalized score 0-100 & raw workUnits
 */
export async function runCPUBenchmark(durationMs: number = 3000): Promise<CPUBenchmarkResult> {
  return new Promise((resolve) => {
    // Defer to next tick to allow UI to update
    setTimeout(() => {
      const start = performance.now();
      const end = start + durationMs;

      let workUnits = 0;
      let checksum = 0;

      while (performance.now() < end) {
        checksum += runWorkUnit();
        workUnits++;
      }

      const elapsed = performance.now() - start;

      if (!Number.isFinite(checksum)) {
        console.log('benchmark checksum:', checksum);
      }

      console.log({
        workUnits,
        elapsed,
        workUnitsPerSecond: workUnits / (elapsed / 1000),
      });

      const score = normalizeSingleCoreScore(workUnits, elapsed);

      resolve({
        ops: workUnits,
        score,
        durationMs: elapsed,
      });
    }, 50);
  });
}
