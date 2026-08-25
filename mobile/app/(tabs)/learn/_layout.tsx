import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useTheme';

export default function LearnLayout() {
  const colors = useThemeColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  );
}
