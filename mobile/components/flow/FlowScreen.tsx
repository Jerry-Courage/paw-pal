import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useTheme';

interface FlowScreenProps {
  children: React.ReactNode;
  safeArea?: boolean;
  scroll?: boolean;
  style?: any;
}

export default function FlowScreen({ children, safeArea = true, scroll = false, style }: FlowScreenProps) {
  const colors = useThemeColors();

  if (scroll) {
    const inner = (
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );

    if (safeArea) {
      return <SafeAreaView style={[styles.container, { backgroundColor: colors.background }, style]}>{inner}</SafeAreaView>;
    }

    return <View style={[styles.container, { backgroundColor: colors.background }, style]}>{inner}</View>;
  }

  if (safeArea) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }, style]}>
        {children}
      </SafeAreaView>
    );
  }

  return <View style={[styles.container, { backgroundColor: colors.background }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
