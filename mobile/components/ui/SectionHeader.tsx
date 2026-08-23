import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function SectionHeader({ title, action, onAction, style }: SectionHeaderProps) {
  const colors = useThemeColors();

  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }, style]}>
      <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }}>
        {title}
      </Text>
      {action && onAction && (
        <Text
          onPress={onAction}
          style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}
        >
          {action}
        </Text>
      )}
    </View>
  );
}
