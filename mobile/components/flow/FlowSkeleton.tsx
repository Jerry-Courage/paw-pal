import React from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';

interface FlowSkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function FlowSkeleton({ width, height, borderRadius, style }: FlowSkeletonProps) {
  const colors = useThemeColors();
  const pulse = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const widthStyle = typeof width === 'number' ? { width } : { width: width as any };

  return (
    <Animated.View
      style={[
        styles.skeleton,
        widthStyle,
        {
          height,
          borderRadius: borderRadius ?? 8,
          backgroundColor: colors.card,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
});
