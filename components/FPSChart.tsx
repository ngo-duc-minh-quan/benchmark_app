import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  timeline: { t: number; fps: number }[];
  targetHz: number;
}

export default function FPSChart({ timeline, targetHz }: Props) {
  if (!timeline || timeline.length === 0) return null;

  const fpsValues = timeline.map(d => d.fps);
  const maxFPS = Math.max(...fpsValues, targetHz);
  const minFPS = Math.min(...fpsValues, 20);
  
  // Calculate average
  const avgFPS = Math.round(fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📈 Performance Timeline (FPS)</Text>
      
      <View style={styles.chartContainer}>
        {/* Y Axis Grid Lines & Labels */}
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>{Math.round(maxFPS)}</Text>
          <Text style={styles.yLabel}>{Math.round((maxFPS + minFPS) / 2)}</Text>
          <Text style={styles.yLabel}>{Math.round(minFPS)}</Text>
        </View>

        {/* Chart Bars */}
        <View style={styles.barsContainer}>
          {timeline.map((item, idx) => {
            // Height ratio based on min/max
            const heightPct = maxFPS === minFPS ? 50 : ((item.fps - minFPS * 0.8) / (maxFPS - minFPS * 0.8)) * 100;
            const barHeight = Math.max(5, Math.min(100, heightPct));
            
            // Color based on performance
            const color = item.fps >= targetHz * 0.92 ? Colors.primary
                        : item.fps >= targetHz * 0.75 ? Colors.success
                        : item.fps >= targetHz * 0.5 ? Colors.warning
                        : Colors.danger;

            return (
              <View key={idx} style={styles.barWrapper}>
                <View 
                  style={[
                    styles.bar, 
                    { 
                      height: `${barHeight}%`, 
                      backgroundColor: color,
                      opacity: 0.8
                    }
                  ]} 
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* X Axis & Summary Info */}
      <View style={styles.xAxis}>
        <Text style={styles.xLabel}>0s (Start)</Text>
        <Text style={styles.avgLabel}>Avg: {avgFPS} FPS</Text>
        <Text style={styles.xLabel}>{timeline[timeline.length - 1]?.t}s (End)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bgGlass,
    borderColor: Colors.border.default,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  chartContainer: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
    marginTop: Spacing.xs,
  },
  yAxis: {
    height: '100%',
    width: 32,
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  yLabel: {
    color: Colors.text.muted,
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'right',
    paddingRight: 6,
  },
  barsContainer: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: Spacing.xs,
  },
  barWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    marginHorizontal: 1,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  xLabel: {
    color: Colors.text.muted,
    fontSize: 10,
  },
  avgLabel: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});
