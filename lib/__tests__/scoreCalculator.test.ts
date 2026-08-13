import { describe, it, expect } from 'vitest';
import { calculateScore, classifyTier } from '../scoreCalculator';

describe('scoreCalculator', () => {
  it('should return correct metrics for stable 60 FPS (16.67ms frame-times)', () => {
    // 600 frames at ~16.666ms (10 seconds)
    const frameTimes = Array(600).fill(16.6666);
    const fpsArray = Array(20).fill(60);

    const result = calculateScore(fpsArray, frameTimes, 0, 50, 50, 60);

    expect(result.avgFPS).toBeCloseTo(60, 0);
    expect(result.onePercentLow).toBeCloseTo(60, 0);
    expect(result.stability).toBeGreaterThanOrEqual(99);
    expect(result.retention).toBe(100);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('should cap performance component at 100 for stable 120 FPS', () => {
    // 1200 frames at 8.33ms (10 seconds)
    const frameTimes = Array(1200).fill(8.3333);
    const fpsArray = Array(20).fill(120);

    const result = calculateScore(fpsArray, frameTimes, 0, 80, 80, 120);

    expect(result.avgFPS).toBeCloseTo(120, 0);
    expect(result.gpuScore).toBeLessThanOrEqual(100);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('should lower 1% Low when 60 FPS has micro-stutters (50-100ms frames)', () => {
    // 590 normal 16.67ms frames + 10 stutter frames (80ms)
    const normalFrames = Array(590).fill(16.6666);
    const stutterFrames = Array(10).fill(80);
    const frameTimes = [...normalFrames, ...stutterFrames];
    const fpsArray = Array(20).fill(60);

    const result = calculateScore(fpsArray, frameTimes, 0, 50, 50, 60);

    // 1% Low should drop significantly below 60 (1000 / 80ms = 12.5 FPS)
    expect(result.onePercentLow).toBeLessThan(30);
    expect(result.stability).toBeLessThan(90);
  });

  it('should calculate retention around 50% when first 15% is 60 FPS and last 15% is 30 FPS', () => {
    // 20 samples: 3 first samples at 60 FPS, middle at 45 FPS, 3 last samples at 30 FPS
    const fpsArray = [60, 60, 60, 50, 50, 50, 45, 45, 45, 45, 40, 40, 40, 35, 35, 35, 30, 30, 30, 30];
    const frameTimes = Array(600).fill(20);

    const result = calculateScore(fpsArray, frameTimes, 0, 50, 50, 60);

    expect(result.retention).toBeCloseTo(50, 0);
  });

  it('should fallback gracefully to fpsArray when frameTimesMs is empty', () => {
    const fpsArray = [60, 60, 58, 60, 62, 59, 60, 61];
    const result = calculateScore(fpsArray, [], 0, 40, 40, 60);

    expect(result.avgFPS).toBeGreaterThan(50);
    expect(result.stability).toBeGreaterThan(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('should return score 0 without NaN/Infinity for empty inputs', () => {
    const result = calculateScore([], [], 0, 0, 0, 60);

    expect(result.score).toBe(0);
    expect(result.avgFPS).toBe(0);
    expect(result.onePercentLow).toBe(0);
    expect(result.stability).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('should correctly classify performance tiers', () => {
    expect(classifyTier(90)).toBe('S');
    expect(classifyTier(75)).toBe('A');
    expect(classifyTier(60)).toBe('B');
    expect(classifyTier(40)).toBe('C');
  });
});
