import React from 'react';
import { View, Text, Image, ImageStyle, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { FONT_SIZE } from '@/constants/theme';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: ImageStyle;
}

export function Avatar({ uri, name, size = 40, style }: AvatarProps) {
  const colors = useThemeColors();

  const getInitials = () => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text
        style={{
          color: '#ffffff',
          fontSize: size * 0.35,
          fontWeight: '700',
        }}
      >
        {getInitials()}
      </Text>
    </View>
  );
}
