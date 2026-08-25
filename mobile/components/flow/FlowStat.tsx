import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, TYPOGRAPHY } from '@/constants/theme';

interface FlowStatProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export default function FlowStat({ label, value, icon, color, size = 'md', style }: FlowStatProps) {
  const colors = useThemeColors();
  const accentColor = color || colors.primary;

  const iconSize = size === 'sm' ? 32 : 40;
  const valueStyle = size === 'sm' ? TYPOGRAPHY.statSmall : TYPOGRAPHY.stat;

  return (
    <View style={[styles.container, style]}>
      {icon && (
        <View
          style={[
            styles.iconCircle,
            {
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize / 2,
              backgroundColor: accentColor + '18',
            },
          ]}
        >
          {icon}
        </View>
      )}
      <Text style={[styles.value, valueStyle, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...TYPOGRAPHY.stat,
  },
  label: {
    ...TYPOGRAPHY.caption,
  },
});
