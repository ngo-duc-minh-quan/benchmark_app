// components/NativeStressTestEngine.tsx
// Native GPU benchmark using expo-gl + Three.js
// Key difference from web: uses native OpenGL ES → unlocks 120Hz, no browser cap

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { Renderer } from 'expo-three';
import { Colors, FontSize, BorderRadius, Spacing } from '../constants/theme';
import { BenchmarkResult, calculateScore } from '../lib/scoreCalculator';
import { runCPUBenchmark } from '../lib/cpuBenchmark';
import * as Battery from 'expo-battery';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_HEIGHT = Math.round(SCREEN_WIDTH * 0.56); // 16:9 aspect

type TestState = 'idle' | 'cpu' | 'running' | 'computing' | 'done';

interface Props {
  onComplete: (result: BenchmarkResult) => void;
  duration?: number;
}

export default function NativeStressTestEngine({ onComplete, duration = 60 }: Props) {
  // Three.js refs
  const rendererRef = useRef<Renderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cubesRef = useRef<THREE.Mesh[]>([]);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const animFrameRef = useRef<number>(0);

  // FPS tracking refs
  const fpsArrayRef = useRef<number[]>([]);
  const fpsTimelineRef = useRef<{ t: number; fps: number }[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastFPSSampleRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const startBatteryRef = useRef<number>(100);
  const cpuResultRef = useRef<{ score: number } | null>(null);
  const detectedHzRef = useRef<number>(60);

  // UI state
  const [testState, setTestState] = useState<TestState>('idle');
  const [liveFPS, setLiveFPS] = useState(0);
  const [progress, setProgress] = useState(0);
  const [peakFPS, setPeakFPS] = useState(0);
  const [minFPSLive, setMinFPSLive] = useState(999);
  const [detectedHz, setDetectedHz] = useState<number | null>(null);
  const [glError, setGlError] = useState<string | null>(null); // GL init error
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ─── Build Three.js scene ───────────────────────────────────────────────
  const buildScene = useCallback((gl: ExpoWebGLRenderingContext) => {
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;

    // expo-three Renderer (wraps native OpenGL ES)
    const renderer = new Renderer({ gl });
    renderer.setSize(W, H);
    renderer.setClearColor(0x080b12, 1);
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b12);
    scene.fog = new THREE.FogExp2(0x080b12, 0.012);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.set(0, 8, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Lighting
    scene.add(new THREE.AmbientLight(0x1a2040, 2));

    const dirLight = new THREE.DirectionalLight(0x00d4ff, 3);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    scene.add(Object.assign(new THREE.PointLight(0x7c3aed, 5, 40), {
      position: new THREE.Vector3(-15, 10, 0),
    }));

    scene.add(Object.assign(new THREE.PointLight(0xff3b3b, 3, 30), {
      position: new THREE.Vector3(15, 5, -10),
    }));

    // Ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0a0e1a, roughness: 0.9, metalness: 0.1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    scene.add(ground);

    // ── 2,000 Cubes (reduced from 4,000 for stability on first run) ──
    const cubes: THREE.Mesh[] = [];
    const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const cubeColors = [0x00d4ff, 0x7c3aed, 0xff3b3b, 0xffb800, 0x00e676, 0xff6b35];
    const materials = cubeColors.map(color =>
      new THREE.MeshStandardMaterial({
        color, roughness: 0.3, metalness: 0.7,
        emissive: new THREE.Color(color), emissiveIntensity: 0.05,
      }),
    );

    for (let i = 0; i < 2000; i++) {
      const cube = new THREE.Mesh(geometry, materials[i % materials.length]);
      cube.position.set(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 60,
      );
      cube.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      cube.userData.spinX = (Math.random() - 0.5) * 0.02;
      cube.userData.spinY = (Math.random() - 0.5) * 0.02;
      cube.userData.spinZ = (Math.random() - 0.5) * 0.01;
      cube.userData.floatOffset = Math.random() * Math.PI * 2;
      cube.userData.floatSpeed = 0.3 + Math.random() * 0.7;
      cube.userData.baseY = cube.position.y;
      scene.add(cube);
      cubes.push(cube);
    }
    cubesRef.current = cubes;
  }, []);

  // ─── GL context ready ──────────────────────────────────────────────────
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    try {
      glRef.current = gl;
      buildScene(gl);

      // Detect actual refresh rate via rAF delta timing
      const samples: number[] = [];
      let lastTime = Date.now();

      const detectHz = () => {
        const now = Date.now();
        const delta = now - lastTime;
        lastTime = now;
        if (delta > 2 && delta < 60) samples.push(delta);
        if (samples.length >= 30) {
          const avgDelta = samples.reduce((a, b) => a + b, 0) / samples.length;
          const hz = Math.round(1000 / avgDelta);
          detectedHzRef.current = hz;
          setDetectedHz(hz);
          return;
        }
        requestAnimationFrame(detectHz);
      };
      requestAnimationFrame(detectHz);

      // Idle preview loop
      const idleLoop = () => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        animFrameRef.current = requestAnimationFrame(idleLoop);

        const t = Date.now() / 1000;
        cubesRef.current.forEach((c, i) => {
          c.rotation.x += 0.003;
          c.rotation.y += 0.004;
          c.position.y = c.userData.baseY + Math.sin(t * 0.5 + i * 0.01) * 0.3;
        });
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
      batteryDrain = Math.max(0, startBatteryRef.current - Math.round(currentLevel * 100));
    } catch { /* expo-battery might fail in emulator */ }

    const result = calculateScore(
      fpsArrayRef.current,
      batteryDrain,
      cpuResultRef.current?.score ?? 0,
    );

    const finalResult: BenchmarkResult = {
      ...result,
      batteryDrain,
      fpsTimeline: fpsTimelineRef.current,
      duration,
      detectedHz: detectedHzRef.current,
    };

    setTestState('done');
    onComplete(finalResult);
  }, [duration, onComplete]);

  // ─── Main benchmark loop ───────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const gl = glRef.current;
    if (!gl || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    startTimeRef.current = Date.now();
    lastFPSSampleRef.current = Date.now();
    frameCountRef.current = 0;
    fpsArrayRef.current = [];
    fpsTimelineRef.current = [];
    const testDuration = duration * 1000;

    const loop = () => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;

      // Update progress
      const prog = Math.min(100, (elapsed / testDuration) * 100);
      setProgress(prog);
      Animated.timing(progressAnim, {
        toValue: prog / 100,
        duration: 200,
        useNativeDriver: false,
      }).start();

      if (elapsed >= testDuration) {
        finishTest();
        return;
      }

      // Animate cubes
      const t = elapsed / 1000;
      const cubes = cubesRef.current;
      for (let i = 0; i < cubes.length; i++) {
        const cube = cubes[i];
        cube.rotation.x += cube.userData.spinX;
        cube.rotation.y += cube.userData.spinY;
        cube.rotation.z += cube.userData.spinZ;
        cube.position.y = cube.userData.baseY +
          Math.sin(t * cube.userData.floatSpeed + cube.userData.floatOffset) * 0.5;
      }

      // Camera orbit
      cameraRef.current!.position.x = Math.sin(t * 0.1) * 35;
      cameraRef.current!.position.z = Math.cos(t * 0.1) * 35;
      cameraRef.current!.position.y = 8 + Math.sin(t * 0.05) * 5;
      cameraRef.current!.lookAt(0, 0, 0);
      rendererRef.current!.render(sceneRef.current!, cameraRef.current!);
      gl.endFrameEXP();

      // FPS sampling every 200ms
      frameCountRef.current++;
      if (now - lastFPSSampleRef.current >= 200) {
        const sampleDelta = now - lastFPSSampleRef.current;
        const fps = Math.round((frameCountRef.current / sampleDelta) * 1000);
        frameCountRef.current = 0;
        lastFPSSampleRef.current = now;

        fpsArrayRef.current.push(fps);
        fpsTimelineRef.current.push({ t: Math.round(elapsed / 1000), fps });

        setLiveFPS(fps);
        setPeakFPS(prev => Math.max(prev, fps));
        setMinFPSLive(prev => Math.min(prev, fps));
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
    cpuResultRef.current = null;
    cancelAnimationFrame(animFrameRef.current);

    // Phase 1: CPU test
    const cpuRes = await runCPUBenchmark(3000);
    cpuResultRef.current = cpuRes;

    // Record start battery
    try {
      const level = await Battery.getBatteryLevelAsync();
      startBatteryRef.current = Math.round(level * 100);
    } catch {
      startBatteryRef.current = 100;
    }

    // Phase 2: GPU stress test
    setTestState('running');
    setTimeout(startLoop, 100);
  }, [startLoop]);

  const stopTest = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setTestState('idle');
    setProgress(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
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
      {/* GL Error fallback — shown instead of crash */}
      {glError ? (
        <View style={styles.glErrorContainer}>
          <Text style={styles.glErrorIcon}>⚠️</Text>
          <Text style={styles.glErrorTitle}>GPU Context Error</Text>
          <Text style={styles.glErrorMsg}>{glError}</Text>
          <Text style={styles.glErrorHint}>
            expo-gl / Three.js failed to initialize.{`\n`}
            Try restarting the app.
          </Text>
        </View>
      ) : (
        <>
          {/* Three.js GL View */}
          <GLView
            style={styles.glView}
            onContextCreate={onContextCreate}
          />

          {/* HUD Overlay */}
          <View style={styles.hud} pointerEvents="none">
            {/* Top-left: FPS counter */}
            <View style={styles.hudTopLeft}>
              <View style={styles.hudBadge}>
                <Text style={[styles.fpsNumber, { color: fpsColor }]}>
                  {isRunning ? liveFPS : '—'}
                </Text>
                <Text style={styles.fpsLabel}>FPS</Text>
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
                </>
              )}
            </View>

            {/* Top-right: cube count + detected Hz */}
            <View style={styles.hudTopRight}>
              <View style={styles.hudBadge}>
                <Text style={styles.hudInfoText}>2,000 cubes</Text>
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
                <Animated.View
                  style={[styles.progressBar, {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  }]}
                />
              </View>
            )}

            {/* Idle label */}
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

            {/* CPU phase overlay */}
            {isCPU && (
              <View style={[styles.centerOverlay, styles.blockingOverlay]}>
                <ActivityIndicator size="large" color={Colors.secondary} />
                <Text style={styles.phaseTitle}>Phase 1: CPU Compute Test</Text>
                <Text style={styles.phaseSubTitle}>Running prime sieve + matrix math...</Text>
              </View>
            )}

            {/* Computing overlay */}
            {isComputing && (
              <View style={[styles.centerOverlay, styles.blockingOverlay]}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.phaseTitle}>Computing Score...</Text>
                <Text style={styles.phaseSubTitle}>Analyzing {fpsArrayRef.current.length} FPS samples</Text>
              </View>
            )}
          </View>

          {/* Controls bar */}
          <View style={styles.controls}>
            {isIdle && (
              <TouchableOpacity
                style={styles.startButton}
                onPress={startTest}
                activeOpacity={0.85}
              >
                <Text style={styles.startButtonText}>
                  ▶ Start Benchmark ({duration}s)
                </Text>
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
  container: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  glView: {
    width: '100%',
    height: CANVAS_HEIGHT,
  },
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hudTopLeft: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    gap: 4,
  },
  hudTopRight: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    alignItems: 'flex-end',
    gap: 4,
  },
  hudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hudBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fpsNumber: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  fpsLabel: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    marginLeft: 4,
  },
  hudBadgeValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hudBadgeMeta: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
  },
  hudInfoText: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    gap: 12,
  },
  centerCard: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  centerText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  centerSubText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  phaseTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  phaseSubTitle: {
    color: Colors.secondary,
    fontSize: FontSize.sm,
  },
  controls: {
    position: 'absolute',
    bottom: Spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  startButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  startButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: FontSize.sm,
    letterSpacing: 0.5,
  },
  runningControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  progressText: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
  },
  stopButton: {
    backgroundColor: 'rgba(255,59,59,0.8)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.danger + '80',
  },
  stopButtonText: {
    color: Colors.text.primary,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  // GL error fallback
  glErrorContainer: {
    height: CANVAS_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,59,0.05)',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  glErrorIcon: { fontSize: 36 },
  glErrorTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.danger,
  },
  glErrorMsg: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  glErrorHint: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
