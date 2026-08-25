import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import { ConceptNode } from '@/types';

interface ActivitySheetProps {
  visible: boolean;
  concept: ConceptNode | null;
  onClose: () => void;
  onStart: (conceptId: string) => void;
  onReview: (conceptId: string) => void;
  loading?: boolean;
}

const DIFF_COLORS: Record<string, string> = {
  easy: '#22c55e',
  medium: '#eab308',
  hard: '#ef4444',
};

export default function ActivitySheet({ visible, concept, onClose, onStart, onReview, loading }: ActivitySheetProps) {
  const colors = useThemeColors();

  if (!concept) return null;

  const isCompleted = concept.status === 'completed';
  const isCurrent = concept.status === 'current';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />

        <View style={{
          backgroundColor: colors.elevatedBackground,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.xl,
          paddingBottom: SPACING.xxxl,
          maxHeight: '70%',
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.muted, alignSelf: 'center', marginBottom: SPACING.xl }} />

          {/* Status badge */}
          {isCompleted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md }}>
              <View style={{ backgroundColor: '#22c55e20', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '700' }}>MASTERED</Text>
              </View>
            </View>
          ) : isCurrent ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md }}>
              <View style={{ backgroundColor: colors.primary + '20', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>YOUR NEXT STEP</Text>
              </View>
            </View>
          ) : null}

          {/* Title */}
          <Text style={[TYPOGRAPHY.title, { color: colors.text, marginBottom: SPACING.sm }]}>
            {concept.title}
          </Text>

          {/* Description */}
          {concept.description ? (
            <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginBottom: SPACING.xl, lineHeight: 20 }]}>
              {concept.description}
            </Text>
          ) : null}

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xl }}>
            {concept.xp_earned > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color={colors.xp} />
                <Text style={{ color: colors.xp, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{concept.xp_earned} XP</Text>
              </View>
            )}
            {concept.estimated_minutes > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>~{concept.estimated_minutes} min</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DIFF_COLORS[concept.difficulty] || '#eab308' }} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textTransform: 'capitalize' }}>{concept.difficulty}</Text>
            </View>
          </View>

          {/* Mastery (for completed) */}
          {isCompleted && concept.mastery > 0 && (
            <View style={{ marginBottom: SPACING.xl }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]}>Mastery</Text>
                <Text style={[TYPOGRAPHY.caption, { color: '#22c55e', fontWeight: '600' }]}>{concept.mastery}%</Text>
              </View>
              <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${concept.mastery}%`, backgroundColor: '#22c55e', borderRadius: 3 }} />
              </View>
            </View>
          )}

          {/* Key definitions */}
          {concept.key_definitions && concept.key_definitions.length > 0 && (
            <View style={{ marginBottom: SPACING.xl }}>
              <Text style={[TYPOGRAPHY.label, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm }]}>
                Key Terms
              </Text>
              {concept.key_definitions.slice(0, 3).map((def, i) => (
                <View key={i} style={{ marginBottom: SPACING.xs }}>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{def.term}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }} numberOfLines={2}>{def.definition}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Source */}
          {concept.source_resource_title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xl }}>
              <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }} numberOfLines={1}>
                {concept.source_resource_title}
                {concept.source_page ? ` · p.${concept.source_page}` : ''}
              </Text>
            </View>
          ) : null}

          {/* Action button */}
          {isCurrent && (
            <TouchableOpacity
              onPress={() => onStart(concept.id)}
              disabled={loading}
              style={{
                backgroundColor: colors.primary,
                borderRadius: RADIUS.lg,
                paddingVertical: SPACING.md + 2,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: SPACING.sm,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="play" size={18} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>
                {loading ? 'Loading...' : 'Start'}
              </Text>
            </TouchableOpacity>
          )}

          {isCompleted && (
            <TouchableOpacity
              onPress={() => onReview(concept.id)}
              disabled={loading}
              style={{
                backgroundColor: colors.card,
                borderRadius: RADIUS.lg,
                paddingVertical: SPACING.md + 2,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: SPACING.sm,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="refresh" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.md, fontWeight: '700' }}>
                Review Again
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
