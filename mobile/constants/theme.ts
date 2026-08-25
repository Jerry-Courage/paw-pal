import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  dark: {
    background: '#0B0C1A',
    elevatedBackground: '#141628',
    card: '#1C1F33',
    surface: '#232740',
    primary: '#FF7A1A',
    primaryDark: '#E86A0F',
    accent: '#8b5cf6',
    text: '#ffffff',
    textSecondary: '#8890A4',
    textMuted: '#5A6178',
    border: 'rgba(255,255,255,0.06)',
    borderLight: 'rgba(255,255,255,0.10)',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    muted: 'rgba(255,255,255,0.04)',
    xp: '#FFB020',
    flowCoin: '#FFD166',
    mastery: '#22c55e',
    battle: '#ef4444',
    streak: '#FF7A1A',
    ai: '#8b5cf6',
    tabActive: '#FF7A1A',
    tabInactive: '#5A6178',
  },
  light: {
    background: '#F4F5F7',
    elevatedBackground: '#ffffff',
    card: '#ffffff',
    surface: '#F0F1F4',
    primary: '#FF7A1A',
    primaryDark: '#E86A0F',
    accent: '#7C3AED',
    text: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    border: 'rgba(0,0,0,0.06)',
    borderLight: 'rgba(0,0,0,0.10)',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    muted: 'rgba(0,0,0,0.04)',
    xp: '#D97706',
    flowCoin: '#B8860B',
    mastery: '#16a34a',
    battle: '#dc2626',
    streak: '#EA580C',
    ai: '#7C3AED',
    tabActive: '#FF7A1A',
    tabInactive: '#94a3b8',
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
  xxxxl: 40,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
  pill: 9999,
} as const;

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
} as const;

export const FONT_WEIGHT = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const TYPOGRAPHY = {
  display: { fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.extrabold, lineHeight: 42 },
  heading: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, lineHeight: 30 },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, lineHeight: 26 },
  subtitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, lineHeight: 22 },
  body: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.regular, lineHeight: 22 },
  bodySmall: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.regular, lineHeight: 18 },
  caption: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.regular, lineHeight: 16 },
  label: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, lineHeight: 16 },
  stat: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.extrabold, lineHeight: 26 },
  statSmall: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, lineHeight: 22 },
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
