import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();

  const getButtonStyle = (): ViewStyle => {
    const base: ViewStyle = {
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      opacity: disabled || loading ? 0.5 : 1,
    };

    const sizeStyles: Record<string, ViewStyle> = {
      sm: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
      md: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
      lg: { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl },
    };

    const variantStyles: Record<string, ViewStyle> = {
      primary: { backgroundColor: colors.primary },
      secondary: { backgroundColor: colors.card },
      outline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.border,
      },
      ghost: { backgroundColor: 'transparent' },
    };

    return {
      ...base,
      ...sizeStyles[size],
      ...variantStyles[variant],
      width: fullWidth ? '100%' : undefined,
    };
  };

  const getTextColor = (): string => {
    switch (variant) {
      case 'primary':
        return '#ffffff';
      case 'secondary':
        return colors.text;
      case 'outline':
        return colors.primary;
      case 'ghost':
        return colors.primary;
      default:
        return colors.text;
    }
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style as ViewStyle]}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <Text
          style={{
            color: getTextColor(),
            fontSize: FONT_SIZE.md,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}
