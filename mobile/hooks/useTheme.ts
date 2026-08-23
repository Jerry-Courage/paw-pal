import { useColorScheme as useRNColorScheme } from 'react-native';
import { COLORS, ColorTokens } from '@/constants/theme';

export function useColorScheme(): 'dark' | 'light' {
  const scheme = useRNColorScheme();
  return scheme === 'light' ? 'light' : 'dark';
}

export function useThemeColors(): ColorTokens {
  const scheme = useColorScheme();
  return COLORS[scheme];
}
