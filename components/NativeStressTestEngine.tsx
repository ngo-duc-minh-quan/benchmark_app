// components/NativeStressTestEngine.tsx
// Native GPU benchmark using expo-gl + Three.js
// FIX: dùng performance.now() + rAF timestamp để đo FPS/Hz chính xác ở 120Hz

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ActivityIndicator, Dimensions,
} from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { createExpoRenderer } from '../lib/ExpoRenderer';
import { Colors, FontSize, BorderRadius, Spacing } from '../constants/theme';
import { BenchmarkResult, calculateScore } from '../lib/scoreCalculator';
import { runCPUBenchmark, normalizeMultiCoreScore } from '../lib/cpuBenchmark';
import HiddenWorkerBridge from './HiddenWorkerBridge';
import { useHardwareInfo } from '../hooks/useHardwareInfo';
import * as Battery from 'expo-battery';
import { Platform } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_HEIGHT = Math.round(SCREEN_WIDTH * 0.56);

type TestState = 'idle' | 'cpu' | 'running' | 'computing' | 'done';

interface Props {
  onComplete: (result: BenchmarkResult) => void;
  duration?: number;
}

export default function NativeStressTestEngine({ onComplete, duration = 60 }: Props) {
  const { info: hwInfo } = useHardwareInfo();
  const [isMeasuringMultiCore, setIsMeasuringMultiCore] = useState(false);
  const multiCoreResolveRef = useRef<((res: { ops: number; elapsedMs: number }) => void) | null>(null);

  const handleMultiCoreComplete = useCallback((ops: number, elapsedMs: number) => {
    setIsMeasuringMultiCore(false);
    if (multiCoreResolveRef.current) {
      multiCoreResolveRef.current({ ops, elapsedMs });
      multiCoreResolveRef.current = null;
    }
  }, []);

  const handleMultiCoreError = useCallback((err: string) => {
    console.warn('[StressTestEngine] Multi-core error:', err);
    setIsMeasuringMultiCore(false);
    if (multiCoreResolveRef.current) {
      multiCoreResolveRef.current({ ops: 0, elapsedMs: 3000 }); // fallback
      multiCoreResolveRef.current = null;
    }
  }, []);

  const runMultiCoreTest = useCallback((cores: number, durationMs: number): Promise<{ ops: number; elapsedMs: number }> => {
    return new Promise((resolve) => {
      multiCoreResolveRef.current = resolve;
      setIsMeasuringMultiCore(true);
    });
  }, []);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const cubesDataRef = useRef<{
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    spinX: number;
    spinY: number;
    spinZ: number;
    floatOffset: number;
    floatSpeed: number;
    baseY: number;
  }[]>([]);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const animFrameRef = useRef<number>(0);

  // FPS tracking — dùng performance.now() thay Date.now()
  const fpsArrayRef = useRef<number[]>([]);
  const fpsTimelineRef = useRef<{ t: number; fps: number }[]>([]);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTsRef = useRef<number>(-1);
  const startPerfRef = useRef<number>(0);       // performance.now() lúc bắt đầu
  const lastSamplePerfRef = useRef<number>(0);  // performance.now() lúc lấy mẫu FPS gần nhất
  const frameCountRef = useRef<number>(0);
  const startBatteryRef = useRef<number>(100);
  const cpuResultRef = useRef<{
    singleCore: number;
    multiCore: number;
    singleCoreWorkUnitsPerSec: number;
    multiCoreWorkUnitsPerSec: number;
    cpuCoresUsed: number;
  } | null>(null);
  const detectedHzRef = useRef<number>(60);

  const [testState, setTestState] = useState<TestState>('idle');
  const [liveFPS, setLiveFPS] = useState(0);
  const [progress, setProgress] = useState(0);
  const [peakFPS, setPeakFPS] = useState(0);
  const [minFPSLive, setMinFPSLive] = useState(999);
  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [isThrottling, setIsThrottling] = useState(false);
  const [throttleDrop, setThrottleDrop] = useState(0);
  const baselineFPSRef = useRef<number>(-1);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ─── Build Three.js scene ───────────────────────────────────────────────
  const buildScene = useCallback((gl: ExpoWebGLRenderingContext) => {
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;

    const renderer = createExpoRenderer(gl);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b12);
    scene.fog = new THREE.FogExp2(0x080b12, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.set(0, 8, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0x1a2040, 2));
    const dirLight = new THREE.DirectionalLight(0x00d4ff, 3);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const pLight1 = new THREE.PointLight(0x7c3aed, 5, 40);
    pLight1.position.set(-15, 10, 0);
    scene.add(pLight1);
    const pLight2 = new THREE.PointLight(0xff3b3b, 3, 30);
    pLight2.position.set(15, 5, -10);
    scene.add(pLight2);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0a0e1a, roughness: 0.9, metalness: 0.1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    scene.add(ground);

    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    // Single MeshStandardMaterial with InstancedMesh coloring is much faster than 2,000 separate materials
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.7,
    });

    const count = 4000;
    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    
    const cubeColors = [0x00d4ff, 0x7c3aed, 0xff3b3b, 0xffb800, 0x00e676, 0xff6b35];
    const dummy = new THREE.Object3D();
    const cubesData = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 60;
      const y = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 60;
      const rx = Math.random() * Math.PI;
      const ry = Math.random() * Math.PI;
      const rz = Math.random() * Math.PI;
      
      dummy.position.set(x, y, z);
      dummy.rotation.set(rx, ry, rz);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);

      const colorHex = cubeColors[i % cubeColors.length];
      instancedMesh.setColorAt(i, new THREE.Color(colorHex));

      cubesData.push({
        x, y, z,
        rx, ry, rz,
        spinX: (Math.random() - 0.5) * 0.02,
        spinY: (Math.random() - 0.5) * 0.02,
        spinZ: (Math.random() - 0.5) * 0.01,
        floatOffset: Math.random() * Math.PI * 2,
        floatSpeed: 0.3 + Math.random() * 0.7,
        baseY: y,
      });
    }

    scene.add(instancedMesh);
    instancedMeshRef.current = instancedMesh;
    cubesDataRef.current = cubesData;
  }, []);

  // ─── GL context ready ──────────────────────────────────────────────────
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    try {
      glRef.current = gl;
      buildScene(gl);

      // ── Detect refresh rate dùng rAF timestamp (performance.now() precision) ──
      // rAF callback nhận DOMHighResTimeStamp (tương đương performance.now())
      // KHÔNG dùng Date.now() vì chỉ chính xác ~1ms, thiếu để đo 8ms/frame ở 120Hz
      const deltas: number[] = [];
      let prevTs = -1;

      const detectHz = (ts: number) => {
        if (prevTs < 0) {
          prevTs = ts;
          requestAnimationFrame(detectHz);
          return;
        }
        const delta = ts - prevTs;
        prevTs = ts;
        // Chỉ chấp nhận delta trong khoảng hợp lệ: 4ms–28ms (35Hz–250Hz)
        if (delta >= 4 && delta <= 28) deltas.push(delta);

        if (deltas.length >= 60) {
          // Dùng median (bỏ outlier) thay vì average
          const sorted = [...deltas].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          const rawHz = 1000 / median;
          // Snap về standard rates
          const stdRates = [60, 90, 120, 144, 165, 240];
          const hz = stdRates.reduce((best, r) =>
            Math.abs(r - rawHz) < Math.abs(best - rawHz) ? r : best,
          );
          detectedHzRef.current = hz;
          setDetectedHz(hz);
          return; // dừng, không requestAnimationFrame tiếp
        }
        requestAnimationFrame(detectHz);
      };
      requestAnimationFrame(detectHz);

      // ── Idle preview loop ──────────────────────────────────────────────
      const idleLoop = (ts: number) => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        animFrameRef.current = requestAnimationFrame(idleLoop);
        const t = ts / 1000;

        const instancedMesh = instancedMeshRef.current;
        const cubesData = cubesDataRef.current;
        if (instancedMesh && cubesData.length > 0) {
          const dummy = new THREE.Object3D();
          for (let i = 0; i < cubesData.length; i++) {
            const data = cubesData[i];
            data.rx += 0.003;
            data.ry += 0.004;
            const currentY = data.baseY + Math.sin(t * 0.5 + i * 0.01) * 0.3;
            dummy.position.set(data.x, currentY, data.z);
            dummy.rotation.set(data.rx, data.ry, data.rz);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
          }
          instancedMesh.instanceMatrix.needsUpdate = true;
        }

        cameraRef.current.position.x = Math.sin(t * 0.05) * 35;
        cameraRef.current.position.z = Math.cos(t * 0.05) * 35;
        cameraRef.current.lookAt(0, 0, 0);
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        gl.endFrameEXP();
      };
      animFrameRef.current = requestAnimationFrame(idleLoop);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[NativeStressTestEngine] GL init failed:', msg);
      setGlError(msg);
    }
  }, [buildScene]);

  // ─── Score computation ─────────────────────────────────────────────────
  const finishTest = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    setTestState('computing');

    let batteryDrain = 0;
    try {
      const currentLevel = await Battery.getBatteryLevelAsync();
      batteryDrain = Math.max(0, startBatteryRef.current - currentLevel * 100);
      batteryDrain = Math.round(batteryDrain * 100) / 100;
    } catch { /* ignore */ }

    // Query real GPU renderer from GL context!
    let detectedGpu = 'OpenGL ES (Native)';
    const gl = glRef.current;
    if (gl) {
      detectedGpu = gl.getParameter(gl.RENDERER) || detectedGpu;
    }

    const result = calculateScore(
      fpsArrayRef.current,
      frameTimesRef.current,
      batteryDrain,
      cpuResultRef.current?.singleCore ?? 0,
      cpuResultRef.current?.multiCore ?? 0,
      detectedHzRef.current,  // targetHz = device max refresh rate
      cpuResultRef.current?.singleCoreWorkUnitsPerSec ?? 0,
      cpuResultRef.current?.multiCoreWorkUnitsPerSec ?? 0,
      cpuResultRef.current?.cpuCoresUsed ?? 0,
    );

    onComplete({
      ...result,
      batteryDrain,
      fpsTimeline: fpsTimelineRef.current,
      duration,
      detectedHz: detectedHzRef.current,
      gpuRenderer: detectedGpu,
    });
    setTestState('done');
  }, [duration, onComplete]);

  // ─── Main benchmark loop ───────────────────────────────────────────────
  // KEY FIX: dùng rAF timestamp (DOMHighResTimeStamp) thay Date.now()
  // → chính xác sub-millisecond → FPS chính xác ở 120Hz
  const startLoop = useCallback(() => {
    const gl = glRef.current;
    if (!gl || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    fpsArrayRef.current = [];
    fpsTimelineRef.current = [];
    frameTimesRef.current = [];
    frameCountRef.current = 0;
    const testDurationMs = duration * 1000;
    // startPerfRef sẽ được set ở frame đầu tiên (ts callback)
    startPerfRef.current = -1;
    lastSamplePerfRef.current = -1;
    lastFrameTsRef.current = -1;

    const loop = (ts: number) => {
      // Khởi tạo start time ở frame đầu tiên
      if (startPerfRef.current < 0) {
        startPerfRef.current = ts;
        lastSamplePerfRef.current = ts;
        lastFrameTsRef.current = ts;
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const frameTime = ts - lastFrameTsRef.current;
      lastFrameTsRef.current = ts;

      // Bỏ dữ liệu bất thường nếu app bị gián đoạn/background (frameTime >= 250ms)
      if (frameTime > 0 && frameTime < 250) {
        frameTimesRef.current.push(frameTime);
      }

      const elapsed = ts - startPerfRef.current;

      // Update progress
      const prog = Math.min(100, (elapsed / testDurationMs) * 100);
      setProgress(prog);
      Animated.timing(progressAnim, {
        toValue: prog / 100,
        duration: 100,
        useNativeDriver: false,
      }).start();

      if (elapsed >= testDurationMs) {
        finishTest();
        return;
      }

      // Animate cubes
      const t = elapsed / 1000;
      const instancedMesh = instancedMeshRef.current;
      const cubesData = cubesDataRef.current;
      if (instancedMesh && cubesData.length > 0) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < cubesData.length; i++) {
          const data = cubesData[i];
          data.rx += data.spinX;
          data.ry += data.spinY;
          data.rz += data.spinZ;
          const currentY = data.baseY + Math.sin(t * data.floatSpeed + data.floatOffset) * 0.5;
          dummy.position.set(data.x, currentY, data.z);
          dummy.rotation.set(data.rx, data.ry, data.rz);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
      }

      cameraRef.current!.position.x = Math.sin(t * 0.1) * 35;
      cameraRef.current!.position.z = Math.cos(t * 0.1) * 35;
      cameraRef.current!.position.y = 8 + Math.sin(t * 0.05) * 5;
      cameraRef.current!.lookAt(0, 0, 0);
      rendererRef.current!.render(sceneRef.current!, cameraRef.current!);
      gl.endFrameEXP();

      // FPS sampling mỗi 500ms (đủ frames để tính chính xác)
      frameCountRef.current++;
      const sinceLastSample = ts - lastSamplePerfRef.current;
      if (sinceLastSample >= 500) {
        const fps = Math.round((frameCountRef.current / sinceLastSample) * 1000);
        frameCountRef.current = 0;
        lastSamplePerfRef.current = ts;

        fpsArrayRef.current.push(fps);
        fpsTimelineRef.current.push({ t: Math.round(elapsed / 1000), fps });
        setLiveFPS(fps);
        setPeakFPS(prev => Math.max(prev, fps));
        setMinFPSLive(prev => Math.min(prev, fps));

        // Throttling detection: Set baseline after 10 samples (5 seconds)
        if (fpsArrayRef.current.length === 10) {
          const firstTen = fpsArrayRef.current.slice(0, 10);
          baselineFPSRef.current = firstTen.reduce((a, b) => a + b, 0) / 10;
        }

        if (baselineFPSRef.current > 0) {
          const drop = ((baselineFPSRef.current - fps) / baselineFPSRef.current) * 100;
          if (drop >= 25) {
            setIsThrottling(true);
            setThrottleDrop(Math.round(drop));
          } else {
            setIsThrottling(false);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [duration, finishTest, progressAnim]);

  // ─── Start test ────────────────────────────────────────────────────────
  const startTest = useCallback(async () => {
    setTestState('cpu');
    setProgress(0);
    setLiveFPS(0);
    setPeakFPS(0);
    setMinFPSLive(999);
    setIsThrottling(false);
    setThrottleDrop(0);
    baselineFPSRef.current = -1;
    cpuResultRef.current = null;
    cancelAnimationFrame(animFrameRef.current);

    try {
      const level = await Battery.getBatteryLevelAsync();
      startBatteryRef.current = level * 100;
    } catch {
      startBatteryRef.current = 100;
    }

    // 1. Run Single-Core CPU Test (3s)
    const singleCoreRes = await runCPUBenchmark(3000);
    const singleCoreWups = singleCoreRes.ops / (singleCoreRes.durationMs / 1000);

    // 2. Run Multi-Core CPU Test (3s) via hidden WebView workers
    const cores = hwInfo?.cpuCores ?? (Platform.OS === 'android' ? 8 : 6);
    const multiCoreRes = await runMultiCoreTest(cores, 3000);
    const multiCoreWups = multiCoreRes.ops > 0 ? multiCoreRes.ops / (multiCoreRes.elapsedMs / 1000) : 0;
    const finalMultiCoreScore = multiCoreRes.ops > 0
      ? normalizeMultiCoreScore(multiCoreRes.ops, multiCoreRes.elapsedMs, cores)
      : singleCoreRes.score;

    cpuResultRef.current = {
      singleCore: singleCoreRes.score,
      multiCore: finalMultiCoreScore,
      singleCoreWorkUnitsPerSec: singleCoreWups,
      multiCoreWorkUnitsPerSec: multiCoreWups,
      cpuCoresUsed: cores,
    };

    setTestState('running');
    setTimeout(startLoop, 100);
  }, [startLoop, hwInfo, runMultiCoreTest]);

  const stopTest = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setTestState('idle');
    setProgress(0);
  }, []);

  useEffect(() => {
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, []);

  const isRunning = testState === 'running';
  const isCPU = testState === 'cpu';
  const isComputing = testState === 'computing';
  const isIdle = testState === 'idle' || testState === 'done';

  const fpsColor = liveFPS >= 115 ? Colors.primary
    : liveFPS >= 60 ? Colors.success
    : liveFPS >= 30 ? Colors.warning
    : Colors.danger;

  return (
    <View style={styles.container}>
      {isMeasuringMultiCore && (
        <HiddenWorkerBridge
          cpuCores={hwInfo?.cpuCores ?? (Platform.OS === 'android' ? 8 : 6)}
          durationMs={3000}
          onComplete={handleMultiCoreComplete}
          onError={handleMultiCoreError}
        />
      )}
      {glError ? (
        <View style={styles.glErrorContainer}>
          <Text style={styles.glErrorIcon}>⚠️</Text>
          <Text style={styles.glErrorTitle}>GPU Context Error</Text>
          <Text style={styles.glErrorMsg}>{glError}</Text>
          <Text style={styles.glErrorHint}>
            expo-gl / Three.js failed to initialize.{`\n`}Try restarting the app.
          </Text>
        </View>
      ) : (
        <>
          <GLView style={styles.glView} onContextCreate={onContextCreate} />

          {/* HUD Overlay */}
          <View style={styles.hud} pointerEvents="none">
            {/* Top-left: FPS */}
            <View style={styles.hudTopLeft}>
              <View style={styles.hudBadge}>
                <Text style={[styles.fpsNumber, { color: fpsColor }]}>
                  {isRunning ? liveFPS : '—'}
                </Text>
                <Text style={styles.fpsLabel}> FPS</Text>
              </View>
              {isRunning && (
                <>
                  <View style={styles.hudBadgeSmall}>
                    <Text style={[styles.hudBadgeValue, { color: Colors.success }]}>{peakFPS}</Text>
                    <Text style={styles.hudBadgeMeta}> peak</Text>
                  </View>
                  <View style={styles.hudBadgeSmall}>
                    <Text style={[styles.hudBadgeValue, { color: Colors.danger }]}>
                      {minFPSLive === 999 ? '—' : minFPSLive}
                    </Text>
                    <Text style={styles.hudBadgeMeta}> min</Text>
                  </View>
                  {isThrottling && (
                    <View style={styles.throttleAlert}>
                      <Text style={styles.throttleAlertText}>🌡️ Throttling -{throttleDrop}%</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Top-right: cube count + Hz */}
            <View style={styles.hudTopRight}>
              <View style={styles.hudBadge}>
                <Text style={styles.hudInfoText}>4,000 cubes</Text>
              </View>
              {detectedHz !== null && (
                <View style={[styles.hudBadge, {
                  borderColor: detectedHz >= 90 ? Colors.primary + '66' : Colors.warning + '66',
                }]}>
                  <Text style={[styles.hudInfoText, {
                    color: detectedHz >= 90 ? Colors.primary : Colors.warning,
                  }]}>
                    {detectedHz}Hz
                  </Text>
                </View>
              )}
            </View>

            {/* Progress bar */}
            {isRunning && (
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1], outputRange: ['0%', '100%'],
                  }),
                }]} />
              </View>
            )}

            {/* Idle overlay */}
            {isIdle && (
              <View style={styles.centerOverlay} pointerEvents="none">
                <View style={styles.centerCard}>
                  <Text style={styles.centerText}>
                    {testState === 'done' ? '✅ Test Complete' : 'Preview Mode'}
                  </Text>
                  <Text style={styles.centerSubText}>
                    {testState === 'done' ? 'View your score below' : 'Tap Start to begin benchmark'}
                  </Text>
                </View>
              </View>
            )}

            {/* CPU phase */}
            {isCPU && (
              <View style={[styles.centerOverlay, styles.blockingOverlay]}>
                <ActivityIndicator size="large" color={Colors.secondary} />
                <Text style={styles.phaseTitle}>Phase 1: CPU Test</Text>
                <Text style={styles.phaseSubTitle}>Running prime sieve + matrix math...</Text>
              </View>
            )}

            {/* Computing */}
            {isComputing && (
              <View style={[styles.centerOverlay, styles.blockingOverlay]}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.phaseTitle}>Computing Score...</Text>
                <Text style={styles.phaseSubTitle}>Analyzing {fpsArrayRef.current.length} FPS samples</Text>
              </View>
            )}
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            {isIdle && (
              <TouchableOpacity style={styles.startButton} onPress={startTest} activeOpacity={0.85}>
                <Text style={styles.startButtonText}>▶ Start Benchmark ({duration}s)</Text>
              </TouchableOpacity>
            )}
            {isRunning && (
              <View style={styles.runningControls}>
                <View style={styles.progressBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.progressText}>
                    {Math.round(progress)}% · {Math.round((duration * (100 - progress)) / 100)}s left
                  </Text>
                </View>
                <TouchableOpacity style={styles.stopButton} onPress={stopTest}>
                  <Text style={styles.stopButtonText}>■ Stop</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border.default },
  glView: { width: '100%', height: CANVAS_HEIGHT },
  hud: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hudTopLeft: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, gap: 4 },
  throttleAlert: {
    backgroundColor: 'rgba(255, 59, 59, 0.25)',
    borderColor: 'rgba(255, 59, 59, 0.6)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  throttleAlertText: {
    color: '#ff4d4d',
    fontSize: 11,
    fontWeight: '700',
  },
  hudTopRight: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, alignItems: 'flex-end', gap: 4 },
  hudBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  hudBadgeSmall: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  fpsNumber: { fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
  fpsLabel: { fontSize: FontSize.xs, color: Colors.text.muted },
  hudBadgeValue: { fontSize: FontSize.sm, fontWeight: '600', fontVariant: ['tabular-nums'] },
  hudBadgeMeta: { fontSize: FontSize.xs, color: Colors.text.muted },
  hudInfoText: { fontSize: FontSize.xs, color: Colors.text.secondary },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.1)' },
  progressBar: { height: '100%', backgroundColor: Colors.primary },
  centerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  blockingOverlay: { backgroundColor: 'rgba(0,0,0,0.75)', gap: 12 },
  centerCard: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 4,
  },
  centerText: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600' },
  centerSubText: { color: Colors.text.muted, fontSize: FontSize.xs },
  phaseTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  phaseSubTitle: { color: Colors.secondary, fontSize: FontSize.sm },
  controls: { position: 'absolute', bottom: Spacing.md, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  startButton: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: 12,
    borderRadius: BorderRadius.full, shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  startButtonText: { color: '#000', fontWeight: '700', fontSize: FontSize.sm, letterSpacing: 0.5 },
  runningControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progressBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 8, gap: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  progressText: { color: Colors.text.primary, fontSize: FontSize.sm },
  stopButton: {
    backgroundColor: 'rgba(255,59,59,0.8)', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.danger + '80',
  },
  stopButtonText: { color: Colors.text.primary, fontWeight: '600', fontSize: FontSize.sm },
  glErrorContainer: {
    height: CANVAS_HEIGHT, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,59,59,0.05)', gap: Spacing.sm, padding: Spacing.lg,
  },
  glErrorIcon: { fontSize: 36 },
  glErrorTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.danger },
  glErrorMsg: { fontSize: FontSize.xs, color: Colors.text.secondary, textAlign: 'center', fontFamily: 'monospace' },
  glErrorHint: { fontSize: FontSize.xs, color: Colors.text.muted, textAlign: 'center', lineHeight: 18 },
});
