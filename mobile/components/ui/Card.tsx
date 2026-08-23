import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS } from '@/constants/theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated';
}

export function Card({
  children,
  variant = 'default',
  style,
  ...props
}: CardProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        {
          backgroundColor: variant === 'elevated' ? colors.elevatedBackground : colors.card,
          borderRadius: RADIUS.lg,
          padding: SPACING.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style as ViewStyle,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
