import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useTheme';

export default function ResourceDetailLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
