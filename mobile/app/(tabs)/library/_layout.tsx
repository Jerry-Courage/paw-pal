import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useTheme';

export default function LibraryLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
