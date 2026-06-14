// constants/theme.ts
// Design tokens for BenchmarkX Native App

export const Colors = {
  primary: '#00D2FF',
  secondary: '#7B2FFF',
  accent: '#FF6B35',
  danger: '#FF3B3B',
  success: '#00FF88',
  warning: '#FFB800',

  bgDark: '#050A18',
  bgCard: '#0D1B2E',
  bgGlass: 'rgba(13, 27, 46, 0.85)',

  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.7)',
    muted: 'rgba(255,255,255,0.4)',
    neon: '#00D2FF',
  },

  border: {
    default: 'rgba(0, 210, 255, 0.15)',
    glow: 'rgba(0, 210, 255, 0.4)',
    card: 'rgba(123, 47, 255, 0.2)',
  },
};

export const Gradients = {
  primary: ['#00D2FF', '#7B2FFF'] as [string, string],
  accent: ['#FF6B35', '#FF3B3B'] as [string, string],
  card: ['rgba(13,27,46,0.9)', 'rgba(5,10,24,0.9)'] as [string, string],
  heroText: ['#00D2FF', '#FFFFFF', '#7B2FFF'] as [string, string, string],
  background: ['#050A18', '#0A1628', '#050A18'] as [string, string, string],
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
  hero: 56,
};

export const Shadow = {
  neon: {
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
};
