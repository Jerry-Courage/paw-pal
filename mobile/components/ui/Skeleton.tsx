import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { RADIUS } from '@/constants/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = RADIUS.sm, style }: SkeletonProps) {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.card,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const colors = useThemeColors();
  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Skeleton height={100} borderRadius={12} style={{ marginBottom: 12 }} />
      <Skeleton width="70%" height={14} style={{ marginBottom: 8 }} />
      <Skeleton width="40%" height={12} />
    </Animated.View>
  );
}
