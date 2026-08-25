import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';

interface FlowPillProps {
  label: string;
  color?: string;
  variant?: 'filled' | 'outlined';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export default function FlowPill({ label, color, variant = 'filled', size = 'sm', style }: FlowPillProps) {
  const colors = useThemeColors();
  const pillColor = color || colors.primary;

  const sizeStyles = {
    sm: { paddingVertical: 3, paddingHorizontal: SPACING.sm, fontSize: FONT_SIZE.xs },
    md: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.sm },
  };

  const s = sizeStyles[size];

  const containerStyle = {
    backgroundColor: variant === 'filled' ? pillColor + '20' : 'transparent',
    borderWidth: variant === 'outlined' ? 1 : 0,
    borderColor: variant === 'outlined' ? pillColor + '40' : 'transparent',
    paddingVertical: s.paddingVertical,
    paddingHorizontal: s.paddingHorizontal,
  };

  const textColor = variant === 'filled' ? pillColor : pillColor;

  return (
    <View style={[styles.pill, containerStyle, style]}>
      <Text style={[styles.label, { color: textColor, fontSize: s.fontSize }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: RADIUS.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
  },
});
