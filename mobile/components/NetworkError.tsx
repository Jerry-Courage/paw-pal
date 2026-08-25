import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

interface NetworkErrorProps {
  onRetry?: () => void;
}

export function NetworkError({ onRetry }: NetworkErrorProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.icon, { color: colors.warning }]}>~</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          No internet connection
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Please check your network settings and try again.
        </Text>
        {onRetry && (
          <Button
            title="Retry"
            onPress={onRetry}
            variant="primary"
            fullWidth
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  icon: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 20,
  },
});
