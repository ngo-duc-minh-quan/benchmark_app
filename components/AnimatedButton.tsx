// components/AnimatedButton.tsx
import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, FontSize, Shadow } from '../constants/theme';

interface AnimatedButtonProps {
  onPress: () => void;
  label: string;
  colors?: [string, string];
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'sm' | 'md' | 'lg';
}

export default function AnimatedButton({
  onPress,
  label,
  colors = [Colors.primary, Colors.secondary],
  disabled = false,
  style,
  textStyle,
  size = 'md',
}: AnimatedButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const sizeStyles = {
    sm: { paddingHorizontal: 16, paddingVertical: 8, fontSize: FontSize.sm },
    md: { paddingHorizontal: 24, paddingVertical: 14, fontSize: FontSize.md },
    lg: { paddingHorizontal: 32, paddingVertical: 18, fontSize: FontSize.lg },
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={1}
        style={[styles.wrapper, Shadow.neon, { shadowColor: colors[0] }]}
      >
        <LinearGradient
          colors={disabled ? ['#333', '#222'] : colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.gradient,
            {
              paddingHorizontal: sizeStyles[size].paddingHorizontal,
              paddingVertical: sizeStyles[size].paddingVertical,
            },
          ]}
        >
          <Text
            style={[
              styles.label,
              { fontSize: sizeStyles[size].fontSize },
              textStyle,
            ]}
          >
            {label}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: Colors.text.primary,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
