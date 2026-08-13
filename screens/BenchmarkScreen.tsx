import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Colors, Gradients, FontSize, Spacing, BorderRadius } from '../constants/theme';
import GlassCard from '../components/GlassCard';
import AnimatedButton from '../components/AnimatedButton';
import NativeStressTestEngine from '../components/NativeStressTestEngine';
import FPSChart from '../components/FPSChart';
import { BenchmarkResult, tierConfig } from '../lib/scoreCalculator';
import { useHardwareInfo } from '../hooks/useHardwareInfo';
import { saveResultToServer } from '../lib/api';
import type { RootStackParamList } from '../App';

type BenchmarkNav = NativeStackNavigationProp<RootStackParamList, 'Benchmark'>;

const DURATION_OPTIONS = [30, 60, 120] as const;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline_saved' | 'error';

export default function BenchmarkScreen() {
  const navigation = useNavigation<BenchmarkNav>();
  const { info } = useHardwareInfo();
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 120>(60);
  const [benchmarkKey, setBenchmarkKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const viewShotRef = useRef<any>(null);

  const handleComplete = useCallback(async (r: BenchmarkResult) => {
    setResult(r);
    setSaveStatus('saving');

    // Auto-save to server if hardware info available
    if (info) {
      const saveRes = await saveResultToServer(r, info);
      if (saveRes.success) {
        setSaveStatus('saved');
      } else if (saveRes.isOffline) {
        setSaveStatus('offline_saved');
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

  const handleShare = useCallback(async () => {
    if (!result || !info) return;
    const shareText = `🎮 BenchmarkX Performance Scorecard 🎮

📱 Device: ${info.deviceName}
🧠 SoC: ${info.socName} (${info.cpuCores} Cores)
⚡ Score: ${result.score}/100 (${result.tier}-Tier)

📊 Performance Metrics:
  • Avg FPS: ${result.avgFPS} FPS
  • Stability: ${result.stability}%
  • 1% Low: ${result.onePercentLow} FPS
  • Thermal Retention: ${result.retention}%
  • Battery Drain: ${result.batteryDrain}%
  
🖥️ GPU: ${result.gpuRenderer || info.gpuRenderer}

Benchmark your device at BenchmarkX!`;

    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Share your BenchmarkX Scorecard',
          });
          return;
        }
      }
      await Share.share({
        message: shareText,
      });
    } catch (error) {
      console.warn('[BenchmarkScreen] Image share failed, falling back to text:', error);
      try {
        await Share.share({
          message: shareText,
        });
      } catch (err) {
        console.error('[BenchmarkScreen] Text share fallback failed:', err);
      }
    }
  }, [result, info]);

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
            <ViewShot
              ref={viewShotRef}
              options={{ format: 'png', quality: 0.9 }}
              style={styles.viewShotContainer}
            >
              {/* Image Header */}
              <View style={styles.viewShotHeader}>
                <Text style={styles.viewShotHeaderTitle}>⚡ BENCHMARKX SCORECARD</Text>
                <Text style={styles.viewShotHeaderSubtitle}>Native Performance Report</Text>
              </View>

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
                      saveStatus === 'offline_saved' && { color: Colors.success },
                      saveStatus === 'error' && { color: Colors.danger },
                      saveStatus === 'saving' && { color: Colors.warning },
                    ]}>
                      {saveStatus === 'saving' ? '⏳ Saving to leaderboard...' :
                       saveStatus === 'saved' ? '✅ Saved to leaderboard' :
                       saveStatus === 'offline_saved' ? '📦 Saved locally (sync when online)' :
                       saveStatus === 'error' ? '⚠️ Save failed' : ''}
                    </Text>
                  </View>
                  <View style={styles.scoreCircle}>
                    <Text style={[styles.scoreNumber, { color: tc.color }]}>{result.score}</Text>
                    <Text style={styles.scoreMax}>/100</Text>
                  </View>
                </View>
              </GlassCard>

              {/* 60Hz Lock Banner — hiển thị khi Android Adaptive Refresh Rate khóa FPS */}
              {result.is60HzLocked && (
                <GlassCard style={styles.hzLockBanner} glowColor="#FF9500">
                  <View style={styles.hzLockRow}>
                    <Text style={styles.hzLockIcon}>🔒</Text>
                    <View style={styles.hzLockContent}>
                      <Text style={styles.hzLockTitle}>Possible 60Hz Cap Detected</Text>
                      <Text style={styles.hzLockDesc}>
                        BenchmarkX detected frame pacing consistent with a possible 60Hz system cap.
                        This does not affect your performance score.
                      </Text>
                      <Text style={styles.hzLockTip}>
                        💡 Bật <Text style={{ fontWeight: '700' }}>"Force peak refresh rate"</Text> trong
                        Tuỳ chọn nhà phát triển để mở khoá và đo chính xác hơn.
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              )}

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
                  label="Graphics Score"
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
                  value={result.is60HzLocked
                    ? `${result.effectiveTargetHz}Hz`
                    : `${result.detectedHz}Hz`}
                  sub={result.is60HzLocked
                    ? `locked (${result.detectedHz}Hz panel)`
                    : 'detected refresh'}
                  color={result.is60HzLocked ? '#FF9500' : (result.detectedHz >= 90 ? Colors.primary : Colors.warning)}
                  icon={result.is60HzLocked ? '🔒' : '📺'}
                />
                <MetricCard
                  label="Thermal Retention"
                  value={`${result.retention}%`}
                  sub={result.retention >= 85 ? "Excellent thermal" : result.retention >= 70 ? "Minor throttling" : "Heavy throttling"}
                  color={result.retention >= 85 ? Colors.success : result.retention >= 70 ? Colors.warning : Colors.danger}
                  icon="🌡️"
                />
                <MetricCard
                  label="Battery Drain"
                  value={`${result.batteryDrain}%`}
                  sub={result.batteryDrain > 0 ? `${result.batteryEfficiency} FPS/%` : "Battery change <1%"}
                  color={result.batteryDrain <= 2 ? Colors.success : result.batteryDrain <= 5 ? Colors.warning : Colors.danger}
                  icon="🔋"
                />
              </View>

              {/* Performance Timeline Chart */}
              <FPSChart timeline={result.fpsTimeline} targetHz={result.detectedHz} />

              {/* Hardware context */}
              {info && (
                <GlassCard style={styles.hwCard} glowColor={Colors.border.default}>
                  <Text style={styles.cardLabel}>📱 Tested on</Text>
                  <Text style={styles.hwDevice}>{info.deviceName}</Text>
                  <Text style={styles.hwDetail}>
                    {info.os} · {info.socName} ({info.cpuCores} Cores) · {info.ramGB}GB RAM · {info.screenWidth}×{info.screenHeight}@{info.pixelRatio}x
                  </Text>
                </GlassCard>
              )}
            </ViewShot>

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

            <AnimatedButton
              onPress={handleShare}
              label="📤 Share Scorecard"
              colors={['#10B981', '#059669']}
              style={styles.shareBtn}
            />
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
  card: { width: '31%', alignItems: 'center', gap: 3, paddingVertical: 12, paddingHorizontal: 8 },
  icon: { fontSize: 20 },
  value: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  label: { fontSize: 10, color: Colors.text.secondary, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
  sub: { fontSize: 9, color: Colors.text.muted, textAlign: 'center', lineHeight: 12 },
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
  hzLockBanner: {
    borderColor: '#FF950044',
    backgroundColor: 'rgba(255,149,0,0.06)',
  },
  hzLockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  hzLockIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  hzLockContent: {
    flex: 1,
    gap: 4,
  },
  hzLockTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#FF9500',
    letterSpacing: 0.3,
  },
  hzLockDesc: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  hzLockTip: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    lineHeight: 15,
    marginTop: 2,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,149,0,0.2)',
  },
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
    gap: 8,
  },
  hwCard: { gap: 4 },
  hwDevice: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  hwDetail: { fontSize: FontSize.xs, color: Colors.text.muted },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1 },
  shareBtn: { alignSelf: 'stretch', marginTop: Spacing.xs },
  viewShotContainer: {
    padding: Spacing.md,
    backgroundColor: '#080b12',
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  viewShotHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  viewShotHeaderTitle: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontWeight: '900',
    letterSpacing: 1,
  },
  viewShotHeaderSubtitle: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
