import React from 'react';
import { View, Pressable, Text, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, RADIUS, FONT_SIZE } from '@/constants/theme';

interface FlowTabSwitcherProps {
  tabs: string[];
  activeIndex: number;
  onChange: (index: number) => void;
  style?: ViewStyle;
}

export default function FlowTabSwitcher({ tabs, activeIndex, onChange, style }: FlowTabSwitcherProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.card }, style]}>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(index)}
            style={[
              styles.tab,
              {
                backgroundColor: isActive ? colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: isActive ? '#ffffff' : colors.textSecondary,
                },
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
    gap: SPACING.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
});
