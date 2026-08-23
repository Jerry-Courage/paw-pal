import React from 'react';
import { View, ScrollView, StyleSheet, ViewStyle, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useTheme';
import { LAYOUT } from '@/constants/theme';

interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  scroll?: boolean;
  safeArea?: boolean;
  keyboardAvoid?: boolean;
}

export function Screen({
  children,
  style,
  padded = true,
  scroll = false,
  safeArea = true,
  keyboardAvoid = true,
}: ScreenProps) {
  const colors = useThemeColors();

  const content = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: padded ? LAYOUT.screenWidth * 0.05 : 0,
        maxWidth: LAYOUT.maxContentWidth,
        alignSelf: 'center',
        width: '100%',
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={{
        flex: 1,
        padding: padded ? LAYOUT.screenWidth * 0.05 : 0,
        maxWidth: LAYOUT.maxContentWidth,
        alignSelf: 'center',
        width: '100%',
      }}
    >
      {children}
    </View>
  );

  const wrappedContent = keyboardAvoid ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );

  if (safeArea) {
    return (
      <SafeAreaView
        style={[{ flex: 1, backgroundColor: colors.background }, style]}
        edges={['top', 'left', 'right']}
      >
        {wrappedContent}
      </SafeAreaView>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {wrappedContent}
    </View>
  );
}
