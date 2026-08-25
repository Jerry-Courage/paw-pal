import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    router.replace('/(tabs)');
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          onTryAgain={this.handleTryAgain}
          onGoHome={this.handleGoHome}
        />
      );
    }
    return this.props.children;
  }
}

function ErrorFallback({
  onTryAgain,
  onGoHome,
}: {
  onTryAgain: () => void;
  onGoHome: () => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.emoji, { color: colors.error }]}>!</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Something went wrong
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          An unexpected error occurred. Please try again.
        </Text>
        <View style={styles.buttons}>
          <Button
            title="Try Again"
            onPress={onTryAgain}
            variant="primary"
            fullWidth
          />
          <Button
            title="Go Home"
            onPress={onGoHome}
            variant="outline"
            fullWidth
          />
        </View>
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
    maxWidth: 320,
  },
  emoji: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 22,
  },
  buttons: {
    width: '100%',
    gap: SPACING.sm,
  },
});
