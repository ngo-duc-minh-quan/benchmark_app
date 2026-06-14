// lib/cpuBenchmark.ts
// Native CPU benchmark — chạy thuật toán prime sieve trực tiếp trên JS thread
// Trên Native, JS engine (Hermes/JSC) gần với native speed hơn web browser

export interface CPUBenchmarkResult {
  ops: number;   // number of primes found
  score: number; // 0-100 normalized
  durationMs: number;
}

/**
 * Sieve of Eratosthenes — tìm số nguyên tố đến N
 * Đây là test CPU-intensive cổ điển: nhiều phép toán boolean + memory access
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
 */
function matMul(size: number): number {
  const a = new Float64Array(size * size).map(() => Math.random());
  const b = new Float64Array(size * size).map(() => Math.random());
  const c = new Float64Array(size * size);

  for (let i = 0; i < size; i++) {
    for (let k = 0; k < size; k++) {
      const aik = a[i * size + k];
      for (let j = 0; j < size; j++) {
        c[i * size + j] += aik * b[k * size + j];
      }
    }
  }
  return c[0]; // prevent optimization
}

/**
 * Run CPU benchmark for `durationMs` milliseconds
 * Returns normalized score 0-100
 */
export async function runCPUBenchmark(durationMs: number = 3000): Promise<CPUBenchmarkResult> {
  return new Promise((resolve) => {
    // Defer to next tick to allow UI to update
    setTimeout(() => {
      const start = Date.now();
      let totalOps = 0;
      
      // Phase 1: Prime Sieve (2 seconds)
      const phase1End = start + durationMs * 0.6;
      while (Date.now() < phase1End) {
        totalOps += primeSieve(500_000);
      }

      // Phase 2: Matrix Multiplication (1 second)
      const phase2End = start + durationMs;
      let matResult = 0;
      while (Date.now() < phase2End) {
        matResult += matMul(100);
        totalOps += 100;
      }
      
      // Prevent dead code elimination
      if (matResult === Infinity) console.log('unlikely');

      const elapsed = Date.now() - start;
      
      // Normalize: ~80,000 primes in 3s on flagship (Redmi Turbo 4 Pro) = 100 score
      // Native JS (Hermes) is much faster than web, so calibrate accordingly
      const opsPerSecond = totalOps / (elapsed / 1000);
      const score = Math.min(100, (opsPerSecond / 60_000_000) * 100);

      resolve({
        ops: totalOps,
        score: Math.round(score * 10) / 10,
        durationMs: elapsed,
      });
    }, 50);
  });
}
