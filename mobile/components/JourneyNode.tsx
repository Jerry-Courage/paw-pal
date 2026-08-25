import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useTheme';

export type NodeStatus = 'completed' | 'current' | 'locked';

interface JourneyNodeProps {
  id: string;
  title: string;
  status: NodeStatus;
  mastery: number;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedMinutes: number;
  xpEarned: number;
  reviewsDue: number;
  index: number;
  isLast: boolean;
  isUnitStart?: boolean;
  unitTitle?: string;
  onPress: () => void;
}

const STATUS_CONFIG: Record<NodeStatus, { color: string; bg: string; glow: string }> = {
  completed: { color: '#22c55e', bg: '#22c55e18', glow: '#22c55e00' },
  current: { color: '#FF7A1A', bg: '#FF7A1A15', glow: '#FF7A1A30' },
  locked: { color: '#5A6178', bg: 'transparent', glow: 'transparent' },
};

const DIFF_DOT: Record<string, string> = {
  easy: '#22c55e',
  medium: '#eab308',
  hard: '#ef4444',
};

export default function JourneyNode({
  title,
  status,
  mastery,
  difficulty,
  estimatedMinutes,
  xpEarned,
  reviewsDue,
  index,
  isLast,
  isUnitStart,
  unitTitle,
  onPress,
}: JourneyNodeProps) {
  const colors = useThemeColors();
  const cfg = STATUS_CONFIG[status];
  const nodeSize = status === 'current' ? 48 : 40;

  return (
    <View>
      {/* ── Unit divider ── */}
      {isUnitStart && unitTitle && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: index > 0 ? SPACING.xl : SPACING.lg, marginBottom: SPACING.md, gap: SPACING.sm }}>
          <View style={{ height: 1.5, flex: 1, backgroundColor: colors.border }} />
          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 }}>
            {unitTitle}
          </Text>
          <View style={{ height: 1.5, flex: 1, backgroundColor: colors.border }} />
        </View>
      )}

      <TouchableOpacity
        onPress={onPress}
        disabled={status === 'locked'}
        activeOpacity={status === 'locked' ? 1 : 0.6}
        style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: nodeSize + 16 }}
      >
        {/* ═══ VERTICAL SPINE ═══ */}
        <View style={{ width: 56, alignItems: 'center' }}>
          {/* Connector above */}
          {index > 0 && (
            <View style={{
              width: 3,
              flex: 1,
              backgroundColor: status === 'completed' ? cfg.color + '50' : colors.muted,
              maxHeight: 16,
            }} />
          )}

          {/* ═══ NODE CIRCLE ═══ */}
          <View style={{
            width: nodeSize,
            height: nodeSize,
            borderRadius: status === 'current' ? 14 : nodeSize / 2,
            backgroundColor: status === 'current' ? cfg.color : cfg.bg,
            borderWidth: status === 'current' ? 3 : status === 'completed' ? 2.5 : 2,
            borderColor: cfg.color,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: status === 'current' ? cfg.color : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: status === 'current' ? 0.4 : 0,
            shadowRadius: status === 'current' ? 12 : 0,
            elevation: status === 'current' ? 8 : 0,
          }}>
            {status === 'completed' ? (
              <Ionicons name="checkmark" size={18} color="#fff" />
            ) : status === 'current' ? (
              <Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 1 }} />
            ) : (
              <Ionicons name="lock-closed" size={14} color={cfg.color} />
            )}
          </View>

          {/* Connector below */}
          {!isLast && (
            <View style={{
              width: 3,
              flex: 1,
              minHeight: 16,
              backgroundColor: status === 'completed' ? cfg.color + '30' : colors.muted,
            }} />
          )}
        </View>

        {/* ═══ CONTENT ═══ */}
        <View style={{
          flex: 1,
          backgroundColor: status === 'current' ? cfg.bg : 'transparent',
          borderRadius: 12,
          padding: 12,
          marginBottom: 4,
          marginLeft: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                color: status === 'locked' ? colors.textMuted : colors.text,
                fontSize: FONT_SIZE.sm,
                fontWeight: status === 'current' ? '700' : '500',
                flex: 1,
                lineHeight: 18,
              }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {status === 'current' && (
              <View style={{
                backgroundColor: colors.primary,
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>NEXT</Text>
              </View>
            )}
          </View>

          {/* Meta — only for non-locked */}
          {status !== 'locked' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: DIFF_DOT[difficulty] }} />
              {estimatedMinutes > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{estimatedMinutes}m</Text>
              )}
              {xpEarned > 0 && (
                <Text style={{ color: colors.xp, fontSize: 11, fontWeight: '600' }}>{xpEarned}XP</Text>
              )}
              {reviewsDue > 0 && (
                <View style={{ backgroundColor: '#f9731620', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: '#f97316', fontSize: 10, fontWeight: '600' }}>{reviewsDue} due</Text>
                </View>
              )}
              {status === 'completed' && mastery > 0 && (
                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 24, height: 4, backgroundColor: colors.muted, borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${mastery}%`, backgroundColor: cfg.color, borderRadius: 2 }} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{mastery}%</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}
