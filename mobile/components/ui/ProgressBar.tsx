import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { RADIUS } from '@/constants/theme';

interface ProgressBarProps {
  progress: number;
  height?: number;
  color?: string;
  trackColor?: string;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  height = 6,
  color,
  trackColor,
  style,
}: ProgressBarProps) {
  const colors = useThemeColors();
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View
      style={[
        {
          height,
          borderRadius: RADIUS.full,
          backgroundColor: trackColor || colors.muted,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        style={{
          height: '100%',
          width: `${clampedProgress}%`,
          borderRadius: RADIUS.full,
          backgroundColor: color || colors.primary,
        }}
      />
    </View>
  );
}
