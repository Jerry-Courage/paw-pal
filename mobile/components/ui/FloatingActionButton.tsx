import React from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING } from '@/constants/theme';

interface FloatingActionButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function FloatingActionButton({ icon, onPress, style }: FloatingActionButtonProps) {
  const colors = useThemeColors();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[
        {
          position: 'absolute',
          right: SPACING.lg,
          bottom: SPACING.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        },
        style,
      ]}
    >
      {icon}
    </TouchableOpacity>
  );
}
