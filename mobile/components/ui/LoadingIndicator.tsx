import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE } from '@/constants/theme';

interface LoadingIndicatorProps {
  text?: string;
  fullScreen?: boolean;
}

export function LoadingIndicator({ text, fullScreen = false }: LoadingIndicatorProps) {
  const colors = useThemeColors();

  if (fullScreen) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        {text && (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: FONT_SIZE.sm,
              marginTop: SPACING.lg,
            }}
          >
            {text}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl }}>
      <ActivityIndicator size="large" color={colors.primary} />
      {text && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: FONT_SIZE.sm,
            marginTop: SPACING.lg,
          }}
        >
          {text}
        </Text>
      )}
    </View>
  );
}
