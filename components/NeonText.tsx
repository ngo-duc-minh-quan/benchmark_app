// components/NeonText.tsx
import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { Colors, FontSize } from '../constants/theme';

interface NeonTextProps {
  children: React.ReactNode;
  size?: keyof typeof FontSize;
  color?: string;
  style?: TextStyle;
  bold?: boolean;
}

export default function NeonText({
  children,
  size = 'md',
  color = Colors.primary,
  style,
  bold = false,
}: NeonTextProps) {
  return (
    <Text
      style={[
        styles.base,
        {
          fontSize: FontSize[size],
          color,
          fontWeight: bold ? '700' : '400',
          textShadowColor: color,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 8,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    color: Colors.text.primary,
    letterSpacing: 0.5,
  },
});
