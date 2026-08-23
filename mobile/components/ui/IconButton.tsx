import React from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS } from '@/constants/theme';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  size?: number;
  variant?: 'ghost' | 'filled' | 'outlined';
  style?: ViewStyle;
}

export function IconButton({ icon, onPress, size = 40, variant = 'ghost', style }: IconButtonProps) {
  const colors = useThemeColors();

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      width: size,
      height: size,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    };

    switch (variant) {
      case 'filled':
        return { ...base, backgroundColor: colors.primary };
      case 'outlined':
        return { ...base, borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' };
      case 'ghost':
      default:
        return { ...base, backgroundColor: 'transparent' };
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <TouchableOpacity style={[getContainerStyle(), style]} onPress={handlePress} activeOpacity={0.6}>
      {icon}
    </TouchableOpacity>
  );
}
