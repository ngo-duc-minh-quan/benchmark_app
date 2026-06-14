import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Gradients, FontSize, Spacing, BorderRadius } from '../constants/theme';
import GlassCard from '../components/GlassCard';
import AnimatedButton from '../components/AnimatedButton';
import NativeStressTestEngine from '../components/NativeStressTestEngine';
import { BenchmarkResult, tierConfig } from '../lib/scoreCalculator';
import { useHardwareInfo } from '../hooks/useHardwareInfo';
import { saveResultToServer } from '../lib/api';
import type { RootStackParamList } from '../App';

type BenchmarkNav = NativeStackNavigationProp<RootStackParamList, 'Benchmark'>;

const DURATION_OPTIONS = [30, 60, 120] as const;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function BenchmarkScreen() {
  const navigation = useNavigation<BenchmarkNav>();
  const { info } = useHardwareInfo();
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 120>(60);
  const [benchmarkKey, setBenchmarkKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const handleComplete = useCallback(async (r: BenchmarkResult) => {
    setResult(r);
    setSaveStatus('saving');

    // Auto-save to server if hardware info available
    if (info) {
      const saveRes = await saveResultToServer(r, info);
      if (saveRes.success) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
        console.warn('[BenchmarkScreen] Save failed:', saveRes.error);
      }
    } else {
      setSaveStatus('idle');
    }
  }, [info]);

  const handleReset = useCallback(() => {
    setResult(null);
    setSaveStatus('idle');
    setBenchmarkKey(k => k + 1);
  }, []);

  const tc = result ? tierConfig[result.tier] : null;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgDark} />
      <LinearGradient colors={Gradients.background} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GPU + CPU Benchmark</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Duration selector */}
        {!result && (
          <GlassCard style={styles.durationCard} glowColor={Colors.secondary}>
            <Text style={styles.cardLabel}>⏱ Test Duration</Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.durationBtn,
                    selectedDuration === d && styles.durationBtnActive,
                  ]}
                  onPress={() => setSelectedDuration(d)}
                >
                  <Text style={[
                    styles.durationBtnText,
                    selectedDuration === d && styles.durationBtnTextActive,
                  ]}>
                    {d}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Three.js GL Engine */}
        <NativeStressTestEngine
          key={benchmarkKey}
          onComplete={handleComplete}
          duration={selectedDuration}
        />

        {/* Result Card */}
        {result && tc && (
          <>
            <GlassCard style={styles.tierCard} glowColor={tc.color}>
              <View style={styles.tierHeader}>
                <View style={[styles.tierBadge, { backgroundColor: tc.color + '22', borderColor: tc.color + '55' }]}>
                  <Text style={[styles.tierLetter, { color: tc.color }]}>{result.tier}</Text>
                </View>
                <View style={styles.tierInfo}>
                  <Text style={[styles.tierLabel, { color: tc.color }]}>{tc.label}</Text>
                  <Text style={styles.tierDesc}>{tc.desc}</Text>
                  {/* Save status */}
                  <Text style={[
                    styles.saveStatus,
                    saveStatus === 'saved' && { color: Colors.success },
                    saveStatus === 'error' && { color: Colors.danger },
                    saveStatus === 'saving' && { color: Colors.warning },
                  ]}>
                    {saveStatus === 'saving' ? '⏳ Saving to leaderboard...' :
                     saveStatus === 'saved' ? '✅ Saved to leaderboard' :
                     saveStatus === 'error' ? '⚠️ Offline — not saved' : ''}
                  </Text>
                </View>
                <View style={styles.scoreCircle}>
                  <Text style={[styles.scoreNumber, { color: tc.color }]}>{result.score}</Text>
                  <Text style={styles.scoreMax}>/100</Text>
                </View>
              </View>
            </GlassCard>

            {/* Metrics grid */}
            <View style={styles.metricsGrid}>
              <MetricCard
                label="Avg FPS"
                value={`${result.avgFPS}`}
                sub="frames/sec"
                color={Colors.primary}
                icon="🎮"
              />
              <MetricCard
                label="GPU Score"
                value={`${result.gpuScore}`}
                sub="/ 100"
                color={Colors.secondary}
                icon="🖥"
              />
              <MetricCard
                label="CPU Score"
                value={`${result.cpuScore}`}
                sub="/ 100"
                color={Colors.accent}
                icon="⚡"
              />
              <MetricCard
                label="Stability"
                value={`${result.stability}%`}
                sub="frame consistency"
                color={Colors.success}
                icon="📈"
              />
              <MetricCard
                label="1% Low"
                value={`${result.onePercentLow}`}
                sub="fps (worst frames)"
                color={Colors.warning}
                icon="📉"
              />
              <MetricCard
                label="Display"
                value={`${result.detectedHz}Hz`}
                sub="detected refresh"
                color={result.detectedHz >= 90 ? Colors.primary : Colors.warning}
                icon="📺"
              />
              {result.batteryDrain > 0 && (
                <MetricCard
                  label="Battery Drain"
                  value={`${result.batteryDrain}%`}
                  sub={`${result.batteryEfficiency.toFixed(1)} FPS/%`}
                  color={Colors.danger}
                  icon="🔋"
                />
              )}
            </View>

            {/* Hardware context */}
            {info && (
              <GlassCard style={styles.hwCard} glowColor={Colors.border.default}>
                <Text style={styles.cardLabel}>📱 Tested on</Text>
                <Text style={styles.hwDevice}>{info.deviceName}</Text>
                <Text style={styles.hwDetail}>{info.os} · {info.ramGB}GB RAM · {info.screenWidth}×{info.screenHeight}@{info.pixelRatio}x</Text>
              </GlassCard>
            )}

            {/* Actions */}
            <View style={styles.actionRow}>
              <AnimatedButton
                onPress={handleReset}
                label="Run Again"
                colors={[Colors.secondary, Colors.primary]}
                style={styles.actionBtn}
              />
              <AnimatedButton
                onPress={() => navigation.navigate('Compare', { result })}
                label="Compare"
                colors={Gradients.primary}
                style={styles.actionBtn}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string; sub: string; color: string; icon: string;
}) {
  return (
    <GlassCard style={metricStyles.card} glowColor={color} padding={12}>
      <Text style={metricStyles.icon}>{icon}</Text>
      <Text style={[metricStyles.value, { color }]}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
      <Text style={metricStyles.sub}>{sub}</Text>
    </GlassCard>
  );
}

const metricStyles = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20 },
  value: { fontSize: FontSize.xl, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { fontSize: FontSize.xs, color: Colors.text.secondary, fontWeight: '600' },
  sub: { fontSize: 10, color: Colors.text.muted, textAlign: 'center' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  backText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '600' },
  headerTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  durationCard: { gap: Spacing.sm },
  cardLabel: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  durationRow: { flexDirection: 'row', gap: Spacing.sm },
  durationBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  durationBtnActive: {
    borderColor: Colors.primary + '88',
    backgroundColor: Colors.primary + '22',
  },
  durationBtnText: { color: Colors.text.secondary, fontWeight: '600', fontSize: FontSize.md },
  durationBtnTextActive: { color: Colors.primary },
  tierCard: {},
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tierBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  tierLetter: { fontSize: FontSize.xxl, fontWeight: '900' },
  tierInfo: { flex: 1, gap: 2 },
  tierLabel: { fontSize: FontSize.lg, fontWeight: '700' },
  tierDesc: { fontSize: FontSize.xs, color: Colors.text.muted },
  saveStatus: {
    fontSize: 10,
    color: Colors.text.muted,
    marginTop: 2,
  },
  scoreCircle: { alignItems: 'flex-end' },
  scoreNumber: { fontSize: FontSize.xxl, fontWeight: '900' },
  scoreMax: { fontSize: FontSize.xs, color: Colors.text.muted },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  hwCard: { gap: 4 },
  hwDevice: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  hwDetail: { fontSize: FontSize.xs, color: Colors.text.muted },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1 },
});
