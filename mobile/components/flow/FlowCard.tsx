import React from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS } from '@/constants/theme';

interface FlowCardProps {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
  variant?: 'default' | 'elevated' | 'surface';
}

export default function FlowCard({ children, style, onPress, variant = 'default' }: FlowCardProps) {
  const colors = useThemeColors();
  const scale = React.useRef(new Animated.Value(1)).current;

  const getVariantStyle = () => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: colors.elevatedBackground,
          borderWidth: 0,
          borderColor: 'transparent' as const,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        };
      case 'surface':
        return {
          backgroundColor: colors.surface,
          borderWidth: 0,
          borderColor: 'transparent' as const,
          shadowColor: undefined,
          shadowOffset: undefined,
          shadowOpacity: 0,
          shadowRadius: undefined,
          elevation: 0,
        };
      default:
        return {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: undefined,
          shadowOffset: undefined,
          shadowOpacity: 0,
          shadowRadius: undefined,
          elevation: 0,
        };
    }
  };

  const handlePressIn = () => {
    if (onPress) {
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
    }
  };

  const cardStyle = [styles.card, getVariantStyle(), style];

  if (onPress) {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.8}
          style={cardStyle}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
});
