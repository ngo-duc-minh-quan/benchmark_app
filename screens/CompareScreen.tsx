import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors, Gradients, FontSize, Spacing, BorderRadius } from '../constants/theme';
import GlassCard from '../components/GlassCard';
import AnimatedButton from '../components/AnimatedButton';
import { benchmarkBaselines, DeviceBaseline } from '../lib/benchmarkBaselines';
import { tierConfig } from '../lib/scoreCalculator';
import { fetchLeaderboard, LeaderboardEntry, syncOfflineQueue } from '../lib/api';
import type { RootStackParamList } from '../App';

type CompareNav = NativeStackNavigationProp<RootStackParamList, 'Compare'>;
type CompareRoute = RouteProp<RootStackParamList, 'Compare'>;

type FilterTier = 'ALL' | 'S' | 'A' | 'B' | 'C';

// Unified device shape for display
interface DisplayDevice {
  id: string;
  name: string;
  chipset: string;
  ram: string;
  price: number;
  avgFPS: number;
  onePercentLow: number;
  score: number;
  tier: 'S' | 'A' | 'B' | 'C';
  color: string;
  isUser?: boolean;
  isLive?: boolean;  // từ server
}

export default function CompareScreen() {
  const navigation = useNavigation<CompareNav>();
  const route = useRoute<CompareRoute>();
  const userResult = route.params?.result;
  const [filterTier, setFilterTier] = useState<FilterTier>('ALL');
  const [liveEntries, setLiveEntries] = useState<LeaderboardEntry[]>([]);
  const [isOnline, setIsOnline] = useState<boolean | null>(null); // null = checking

  // Fetch live leaderboard on mount
  useEffect(() => {
    syncOfflineQueue().then(({ syncedCount }) => {
      if (syncedCount > 0) {
        console.log(`[OfflineSync] Synced ${syncedCount} queued benchmark results.`);
      }
      fetchLeaderboard().then(entries => {
        setLiveEntries(entries);
        setIsOnline(entries.length > 0);
      });
    });
  }, []);

  // Build unified device list:
  // 1. Live server entries (if online)
  // 2. Local baselines (always as fallback)
  // 3. User result at top (if available)
  const liveDisplayDevices: DisplayDevice[] = liveEntries
    .filter(e => e.browser && e.browser.includes('v2'))
    .map(e => {
      let chipsetDisplay = e.os;
      // Parse SC/MC scores from browser signature: e.g. "BenchmarkX Native v2 (Android) (SC: 75.2, MC: 88.4)"
      const match = e.browser.match(/\(SC:\s*([\d.]+),\s*MC:\s*([\d.]+)\)/);
      if (match) {
        chipsetDisplay = `${e.os} (SC: ${match[1]} | MC: ${match[2]})`;
      }
      return {
        id: `live-${e.id}`,
        name: e.deviceName,
        chipset: chipsetDisplay,
        ram: '',
        price: 0,
        avgFPS: e.avgFPS,
        onePercentLow: e.onePercentLow,
        score: e.score,
        tier: e.tier as 'S' | 'A' | 'B' | 'C',
        color: (tierConfig as Record<string, { color: string }>)[e.tier]?.color ?? Colors.primary,
        isLive: true,
      };
    });

  // Use live data if available, otherwise baselines
  const baseDevices: DisplayDevice[] = isOnline && liveDisplayDevices.length > 0
    ? liveDisplayDevices
    : benchmarkBaselines.map(b => ({ ...b, isLive: false }));

  const userDeviceEntry: DisplayDevice | null = userResult
    ? {
        id: 'your-device',
        name: 'Your Device ⭐',
        chipset: userResult.singleCoreScore !== undefined && userResult.multiCoreScore !== undefined
          ? `Current Device (SC: ${userResult.singleCoreScore} | MC: ${userResult.multiCoreScore})`
          : 'Current Device',
        ram: '',
        price: 0,
        avgFPS: userResult.avgFPS,
        onePercentLow: userResult.onePercentLow,
        score: userResult.score,
        tier: userResult.tier,
        color: '#FFD700',
        isUser: true,
      }
    : null;

  const listToFilter = userDeviceEntry
    ? [userDeviceEntry, ...baseDevices]
    : baseDevices;

  const allDevices = listToFilter
    .filter(d => filterTier === 'ALL' ? true : d.tier === filterTier)
    .sort((a, b) => b.score - a.score);

  const maxScore = Math.max(...allDevices.map(d => d.score), 1);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgDark} />
      <LinearGradient colors={Gradients.background} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 Leaderboard</Text>
        <View style={[styles.onlineBadge, {
          backgroundColor: isOnline === null ? Colors.warning + '22' :
                          isOnline ? Colors.success + '22' : Colors.danger + '22',
        }]}>
          {isOnline === null
            ? <ActivityIndicator size="small" color={Colors.warning} />
            : <View style={[styles.onlineDot, { backgroundColor: isOnline ? Colors.success : Colors.danger }]} />
          }
          <Text style={[styles.onlineText, {
            color: isOnline === null ? Colors.warning : isOnline ? Colors.success : Colors.danger,
          }]}>
            {isOnline === null ? '' : isOnline ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* User result banner */}
      {userResult && (
        <GlassCard style={styles.userBanner} glowColor="#FFD700" padding={14}>
          <View style={styles.userBannerRow}>
            <Text style={styles.userBannerIcon}>⭐</Text>
            <View style={styles.userBannerInfo}>
              <Text style={styles.userBannerTitle}>Your Result</Text>
              <Text style={styles.userBannerSub}>
                {userResult.avgFPS} avg FPS · {userResult.detectedHz}Hz display
              </Text>
            </View>
            <View style={[styles.userTierBadge, { borderColor: (tierConfig as Record<string, {color: string}>)[userResult.tier].color + '55' }]}>
              <Text style={[styles.userTierText, { color: (tierConfig as Record<string, {color: string}>)[userResult.tier].color }]}>
                {userResult.tier}-Tier
              </Text>
              <Text style={[styles.userScoreText, { color: (tierConfig as Record<string, {color: string}>)[userResult.tier].color }]}>
                {userResult.score}
              </Text>
            </View>
          </View>
        </GlassCard>
      )}

      {/* Tier filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {(['ALL', 'S', 'A', 'B', 'C'] as FilterTier[]).map(tier => (
          <TouchableOpacity
            key={tier}
            style={[
              styles.filterBtn,
              filterTier === tier && styles.filterBtnActive,
              filterTier === tier && { borderColor: tier === 'ALL' ? Colors.primary : tierConfig[tier as 'S' | 'A' | 'B' | 'C']?.color + '88' },
            ]}
            onPress={() => setFilterTier(tier)}
          >
            <Text style={[
              styles.filterBtnText,
              filterTier === tier && {
                color: tier === 'ALL' ? Colors.primary : tierConfig[tier as 'S' | 'A' | 'B' | 'C']?.color,
              },
            ]}>
              {tier === 'ALL' ? 'All Devices' : `${tier}-Tier`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Device list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {allDevices.map((device, i) => {
          const isUser = 'isUser' in device && device.isUser;
          const barWidth = (device.score / maxScore) * 100;

          return (
            <GlassCard
              key={device.id}
              style={isUser ? [styles.deviceRow, styles.deviceRowUser] : styles.deviceRow}
              glowColor={isUser ? '#FFD700' : device.color}
              padding={14}
            >
              {/* Rank + Name */}
              <View style={styles.deviceHeader}>
                <View style={[styles.rankBadge, {
                  backgroundColor: i === 0 ? '#FFD70022' : 'rgba(255,255,255,0.05)',
                  borderColor: i === 0 ? '#FFD70055' : 'rgba(255,255,255,0.08)',
                }]}>
                  <Text style={[styles.rankText, { color: i === 0 ? '#FFD700' : Colors.text.muted }]}>
                    #{i + 1}
                  </Text>
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, isUser && { color: '#FFD700' }]} numberOfLines={1}>
                    {device.name}
                  </Text>
                  <Text style={styles.deviceChip} numberOfLines={1}>
                    {device.chipset}{device.ram ? ` · ${device.ram}` : ''}
                  </Text>
                </View>
                <View style={[styles.tierChip, { backgroundColor: device.color + '22', borderColor: device.color + '44' }]}>
                  <Text style={[styles.tierChipText, { color: device.color }]}>{device.tier}</Text>
                </View>
              </View>

              {/* Score bar */}
              <View style={styles.barContainer}>
                <View style={[styles.barTrack]}>
                  <LinearGradient
                    colors={[device.color, device.color + '88']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.barFill, { width: `${barWidth}%` }]}
                  />
                </View>
                <Text style={[styles.barScore, { color: device.color }]}>{device.score}</Text>
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <StatPill label="Avg FPS" value={`${device.avgFPS}`} color={device.color} />
                <StatPill label="1% Low" value={`${device.onePercentLow}`} color={Colors.text.muted} />
                {!isUser && device.price > 0 && (
                  <StatPill label="Price" value={`~${device.price}tr`} color={Colors.text.muted} />
                )}
              </View>
            </GlassCard>
          );
        })}

        {/* CTA if no result yet */}
        {!userResult && (
          <GlassCard style={styles.ctaCard} glowColor={Colors.primary}>
            <Text style={styles.ctaTitle}>🎮 Run Your Benchmark</Text>
            <Text style={styles.ctaDesc}>
              Test your device and see where you rank against these flagships
            </Text>
            <AnimatedButton
              onPress={() => navigation.navigate('Benchmark')}
              label="Start Benchmark"
              colors={Gradients.primary}
              style={{ marginTop: Spacing.sm }}
            />
          </GlassCard>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={pillStyles.container}>
      <Text style={[pillStyles.value, { color }]}>{value}</Text>
      <Text style={pillStyles.label}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 1 },
  value: { fontSize: FontSize.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { fontSize: 10, color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 5,
    minWidth: 60,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: '600',
  },
  backBtn: { padding: Spacing.xs },
  backText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '600' },
  headerTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  userBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  userBannerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  userBannerIcon: { fontSize: 28 },
  userBannerInfo: { flex: 1 },
  userBannerTitle: { color: '#FFD700', fontWeight: '700', fontSize: FontSize.md },
  userBannerSub: { color: Colors.text.muted, fontSize: FontSize.xs },
  userTierBadge: {
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  userTierText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  userScoreText: { fontSize: FontSize.xl, fontWeight: '900' },
  filterScroll: { flexGrow: 0 },
  filterContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  filterBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(0,210,255,0.08)',
  },
  filterBtnText: { color: Colors.text.muted, fontSize: FontSize.sm, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  deviceRow: { gap: Spacing.sm },
  deviceRowUser: {
    borderColor: '#FFD70033',
  },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  rankText: { fontSize: FontSize.sm, fontWeight: '700' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { color: Colors.text.primary, fontWeight: '600', fontSize: FontSize.sm },
  deviceChip: { color: Colors.text.muted, fontSize: FontSize.xs },
  tierChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierChipText: { fontWeight: '700', fontSize: FontSize.sm },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barScore: {
    fontSize: FontSize.md,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  ctaCard: { alignItems: 'center', gap: Spacing.sm },
  ctaTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  ctaDesc: { color: Colors.text.muted, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 18 },
});
