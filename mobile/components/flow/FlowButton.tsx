import React from 'react';
import {
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE, TYPOGRAPHY } from '@/constants/theme';

interface FlowButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export default function FlowButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  style,
}: FlowButtonProps) {
  const colors = useThemeColors();
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  const sizeMap = {
    sm: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.sm },
    md: { paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.lg, fontSize: FONT_SIZE.md },
    lg: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, fontSize: FONT_SIZE.lg },
  };

  const variantStyles = {
    primary: {
      backgroundColor: disabled ? colors.primary + '60' : colors.primary,
      borderWidth: 0,
      borderColor: 'transparent',
      textColor: '#ffffff',
    },
    secondary: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      textColor: colors.text,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      textColor: colors.text,
    },
  };

  const v = variantStyles[variant];
  const s = sizeMap[size];

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[
          styles.button,
          {
            backgroundColor: v.backgroundColor,
            borderWidth: v.borderWidth,
            borderColor: v.borderColor,
            paddingVertical: s.paddingVertical,
            paddingHorizontal: s.paddingHorizontal,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={v.textColor} />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.text,
                { color: v.textColor, fontSize: s.fontSize },
                icon ? { marginLeft: SPACING.xs } : undefined,
              ]}
            >
              {title}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    minHeight: 44,
  },
  text: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
});
