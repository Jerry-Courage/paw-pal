import { Stack } from 'expo-router';
import { useThemeColors } from '@/hooks/useTheme';

export default function MoreLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="planner" />
      <Stack.Screen name="assignments" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="rankings" />
      <Stack.Screen name="progress" />
      <Stack.Screen name="collab/index" />
      <Stack.Screen name="collab/[id]" />
      <Stack.Screen name="battle/index" />
      <Stack.Screen name="battle/create" />
      <Stack.Screen name="battle/[pin]" />
    </Stack>
  );
}
