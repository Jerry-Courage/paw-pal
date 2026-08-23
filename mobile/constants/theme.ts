import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  dark: {
    background: '#0c0c1d',
    elevatedBackground: '#12122a',
    card: '#1a1a2e',
    primary: '#f97316',
    primaryDark: '#ea580c',
    accent: '#8b5cf6',
    text: '#ffffff',
    textSecondary: '#94a3b8',
    border: 'rgba(255,255,255,0.08)',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    muted: 'rgba(255,255,255,0.04)',
  },
  light: {
    background: '#f8fafc',
    elevatedBackground: '#ffffff',
    card: '#ffffff',
    primary: '#f97316',
    primaryDark: '#ea580c',
    accent: '#8b5cf6',
    text: '#0f172a',
    textSecondary: '#64748b',
    border: 'rgba(0,0,0,0.08)',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    muted: 'rgba(0,0,0,0.04)',
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

export const LAYOUT = {
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  headerHeight: 56,
  tabBarHeight: 80,
  maxContentWidth: 600,
} as const;

export type ColorScheme = 'dark' | 'light';
export type ColorTokens = typeof COLORS.dark;
