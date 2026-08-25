import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import FlowButton from './FlowButton';

interface FlowEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export default function FlowEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
}: FlowEmptyStateProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.card }]}>
        {icon}
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      {actionLabel && onAction && (
        <FlowButton
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={{ marginTop: SPACING.lg }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxxl,
    paddingHorizontal: SPACING.xxl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.subtitle,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  description: {
    ...TYPOGRAPHY.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
});
