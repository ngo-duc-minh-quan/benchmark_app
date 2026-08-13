// screens/HomeScreen.tsx
// Màn hình chính — ported từ app/page.tsx của Next.js web

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Gradients, FontSize, Spacing, BorderRadius, Shadow } from '../constants/theme';
import GlassCard from '../components/GlassCard';
import AnimatedButton from '../components/AnimatedButton';
import { useHardwareInfo } from '../hooks/useHardwareInfo';
import type { RootStackParamList } from '../App';

type HomeNav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const FEATURES = [
  {
    icon: '🎮',
    title: '4,000 Cube GPU Test',
    desc: 'Real OpenGL ES stress via expo-gl — no browser cap',
    color: Colors.primary,
  },
  {
    icon: '⚡',
    title: 'True 120Hz Detection',
    desc: 'Native rAF synced to display refresh rate',
    color: Colors.secondary,
  },
  {
    icon: '🧠',
    title: 'CPU Prime Sieve',
    desc: 'Hermes/JSC native compute benchmark',
    color: Colors.accent,
  },
  {
    icon: '🔋',
    title: 'Battery Drain Tracking',
    desc: 'Works on both iOS and Android (unlike web!)',
    color: Colors.success,
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { info, loading } = useHardwareInfo();
  
  // Animation values
  const pulseAnim = useRef(new Animated.Value(0.97)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(-30)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(20)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;
  const featuresOpacity = useRef(new Animated.Value(0)).current;
  const featuresTranslateY = useRef(new Animated.Value(30)).current;

  React.useEffect(() => {
    // Pulse animation for logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.97, duration: 2000, useNativeDriver: true }),
      ]),
    ).start();

    // Staggered Entrance animation sequence
    Animated.sequence([
      Animated.delay(100),
      // 1. Hero section animates in
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(heroTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      // 2. Device card animates in
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      // 3. Buttons animate in with Spring scale
      Animated.parallel([
        Animated.timing(buttonOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(buttonScale, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
      ]),
      // 4. Features grid & Footer animate in
      Animated.parallel([
        Animated.timing(featuresOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(featuresTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, [pulseAnim, heroOpacity, heroTranslateY, cardOpacity, cardTranslateY, buttonOpacity, buttonScale, featuresOpacity, featuresTranslateY]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgDark} />
      <LinearGradient
        colors={Gradients.background}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <Animated.View style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }]}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={styles.heroIcon}>⚡</Text>
          </Animated.View>

          <Text style={styles.heroTitle}>BenchmarkX</Text>
          <Text style={styles.heroSubtitle}>Native Mobile Edition</Text>

          <LinearGradient
            colors={[Colors.primary + '33', Colors.secondary + '33']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.heroBadge}
          >
            <Text style={styles.heroBadgeText}>🚀 120Hz Unlocked • Native OpenGL ES</Text>
          </LinearGradient>

          <Text style={styles.heroDesc}>
            Native mobile performance benchmark for graphics, CPU,{'\n'}
            frame stability and thermal performance.
          </Text>
        </Animated.View>

        {/* Device Info Card */}
        {!loading && info && (
          <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }}>
            <GlassCard style={styles.deviceCard} glowColor={Colors.primary}>
              <Text style={styles.sectionLabel}>📱 Your Device</Text>
              <Text style={styles.deviceName}>{info.deviceName}</Text>
              <Text style={styles.deviceOS}>
                {info.os} · {info.socName} ({info.cpuCores} Cores)
              </Text>

              <View style={styles.deviceGrid}>
                <DeviceStat icon="🧠" label="RAM" value={`${info.freeRAMGB}G / ${info.ramGB}G`} />
                <DeviceStat icon="🖥" label="Screen" value={`${info.screenWidth}×${info.screenHeight}`} />
                <DeviceStat
                  icon="🔋"
                  label="Battery"
                  value={info.batterySupported ? `${info.batteryLevel}%${info.batteryCharging ? ' ⚡' : ''}` : 'N/A'}
                />
                <DeviceStat icon="📐" label="DPI" value={`${info.pixelRatio}x`} />
              </View>
            </GlassCard>
          </Animated.View>
        )}

        {/* CTA Buttons */}
        <Animated.View style={{ opacity: buttonOpacity, transform: [{ scale: buttonScale }], alignSelf: 'stretch', gap: Spacing.xs }}>
          <AnimatedButton
            onPress={() => navigation.navigate('Benchmark')}
            label="Start Benchmark"
            colors={Gradients.primary}
            size="lg"
            style={styles.ctaButton}
          />

          <TouchableOpacity
            style={styles.compareLink}
            onPress={() => navigation.navigate('Compare')}
          >
            <Text style={styles.compareLinkText}>📊 View Leaderboard & Compare</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Features & Footer */}
        <Animated.View style={{ opacity: featuresOpacity, transform: [{ translateY: featuresTranslateY }], gap: Spacing.lg }}>
          <Text style={styles.sectionTitle}>Why Native Beats Web</Text>
          <View style={styles.featuresGrid}>
            {FEATURES.map((f, i) => (
              <GlassCard key={i} style={styles.featureCard} glowColor={f.color} padding={14}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={[styles.featureTitle, { color: f.color }]}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </GlassCard>
            ))}
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            BenchmarkX Native v2.0 · {Platform.OS === 'android' ? 'Android' : 'iOS'}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function DeviceStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={statStyles.container}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={statStyles.value}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  icon: { fontSize: 18 },
  label: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: FontSize.sm,
    color: Colors.text.primary,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgDark,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  heroIcon: {
    fontSize: 64,
  },
  heroTitle: {
    fontSize: FontSize.hero,
    fontWeight: '900',
    color: Colors.text.primary,
    letterSpacing: -2,
  },
  heroSubtitle: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  heroBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginVertical: Spacing.xs,
  },
  heroBadgeText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  heroDesc: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  deviceCard: { gap: Spacing.xs },
  sectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  deviceName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  deviceOS: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
  },
  deviceGrid: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    paddingTop: Spacing.sm,
  },
  ctaButton: {
    alignSelf: 'stretch',
  },
  compareLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  compareLinkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: Spacing.sm,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  featureCard: {
    width: '47%',
    gap: 4,
  },
  featureIcon: { fontSize: 24 },
  featureTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  featureDesc: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    lineHeight: 16,
  },
  footer: {
    textAlign: 'center',
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
  },
});
