import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
  style?: ViewStyle;
}

export function StatCard({ icon, label, value, color, style }: StatCardProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: RADIUS.lg,
          padding: SPACING.md,
          borderWidth: 1,
          borderColor: colors.border,
          flex: 1,
          minWidth: 100,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 20, marginBottom: SPACING.xs }}>{icon}</Text>
      <Text style={{ color: color || colors.primary, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>
        {value}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}
