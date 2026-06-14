// components/ErrorBoundary.tsx
// Catches JS runtime errors and shows a user-friendly crash screen
// instead of silently killing the app

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/theme';

interface State {
  hasError: boolean;
  error: Error | null;
  info: string;
}

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: '' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ info: errorInfo.componentStack ?? '' });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, info: '' });
  };

  render() {
    if (this.state.hasError) {
      const { fallbackLabel = 'component' } = this.props;
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Lỗi trong {fallbackLabel}</Text>
          <ScrollView style={styles.errorBox} contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.errorText}>{this.state.error?.message ?? 'Unknown error'}</Text>
            {this.state.info ? (
              <Text style={styles.stackText} numberOfLines={10}>
                {this.state.info.trim()}
              </Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={styles.retryBtn} onPress={this.reset}>
            <Text style={styles.retryText}>🔄 Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.bgDark,
    gap: Spacing.md,
  },
  icon: { fontSize: 48 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.danger,
    textAlign: 'center',
  },
  errorBox: {
    maxHeight: 200,
    width: '100%',
    backgroundColor: 'rgba(255,59,59,0.08)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
  },
  errorText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginBottom: 8,
  },
  stackText: {
    color: Colors.text.muted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '22',
    borderWidth: 1,
    borderColor: Colors.primary + '66',
  },
  retryText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
});
