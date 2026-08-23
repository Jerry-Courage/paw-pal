import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  leftIcon,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const colors = useThemeColors();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[{ marginBottom: SPACING.md }, containerStyle]}>
      {label && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: FONT_SIZE.sm,
            marginBottom: SPACING.xs,
            fontWeight: '500',
          }}
        >
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: error
            ? colors.error
            : isFocused
              ? colors.primary
              : colors.border,
          paddingHorizontal: SPACING.md,
          minHeight: 48,
        }}
      >
        {leftIcon && (
          <View style={{ marginRight: SPACING.sm }}>{leftIcon}</View>
        )}
        <TextInput
          style={[
            {
              flex: 1,
              color: colors.text,
              fontSize: FONT_SIZE.md,
              paddingVertical: SPACING.md,
            },
            style,
          ]}
          placeholderTextColor={colors.textSecondary}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
      </View>
      {error && (
        <Text
          style={{
            color: colors.error,
            fontSize: FONT_SIZE.xs,
            marginTop: SPACING.xs,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
