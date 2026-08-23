import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE } from '@/constants/theme';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const colors = useThemeColors();

  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2 }}>
      {icon && (
        <Text style={{ fontSize: 48, marginBottom: SPACING.lg }}>{icon}</Text>
      )}
      <Text
        style={{
          color: colors.text,
          fontSize: FONT_SIZE.lg,
          fontWeight: '600',
          marginBottom: SPACING.sm,
        }}
      >
        {title}
      </Text>
      {description && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: FONT_SIZE.sm,
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          {description}
        </Text>
      )}
    </View>
  );
}
