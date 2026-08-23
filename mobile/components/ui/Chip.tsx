import React from 'react';
import { TouchableOpacity, Text, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, onPress, icon, style }: ChipProps) {
  const colors = useThemeColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.xs,
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm,
          borderRadius: RADIUS.full,
          borderWidth: 1,
          backgroundColor: selected ? colors.primary : 'transparent',
          borderColor: selected ? colors.primary : colors.border,
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          fontSize: FONT_SIZE.sm,
          fontWeight: '600',
          color: selected ? '#ffffff' : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
