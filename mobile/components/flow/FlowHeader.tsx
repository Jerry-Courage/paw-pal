import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, TYPOGRAPHY } from '@/constants/theme';

interface FlowHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: { icon: React.ReactNode; onPress: () => void };
  rightAction?: { icon: React.ReactNode; onPress: () => void };
  style?: ViewStyle;
}

export default function FlowHeader({ title, subtitle, leftAction, rightAction, style }: FlowHeaderProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, style]}>
      {leftAction ? (
        <TouchableOpacity onPress={leftAction.onPress} style={styles.action}>
          {leftAction.icon}
        </TouchableOpacity>
      ) : (
        <View style={styles.action} />
      )}

      <View style={styles.titleContainer}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {rightAction ? (
        <TouchableOpacity onPress={rightAction.onPress} style={styles.action}>
          {rightAction.icon}
        </TouchableOpacity>
      ) : (
        <View style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  action: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.heading,
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.caption,
    textAlign: 'center',
    marginTop: 2,
  },
});
