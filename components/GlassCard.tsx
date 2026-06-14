// components/GlassCard.tsx
import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Shadow } from '../constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  glowColor?: string;
  padding?: number;
}

export default function GlassCard({
  children,
  style,
  glowColor = Colors.primary,
  padding = 16,
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: glowColor + '33',
          padding,
          ...Shadow.card,
          shadowColor: glowColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgGlass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
