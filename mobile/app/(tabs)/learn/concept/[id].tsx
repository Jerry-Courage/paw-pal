import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton } from '@/components/ui';
import { useCompleteConcept, useReviewConcept } from '@/hooks/useLearningPaths';
import { learningService } from '@/services/learning';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import { ConceptNode } from '@/types';

const DIFF_COLORS: Record<string, string> = { easy: '#22c55e', medium: '#eab308', hard: '#ef4444' };
const ASSESS_OPTIONS = [
  { label: 'Again', score: 20, color: '#ef4444', emoji: '🔴' },
  { label: 'Hard', score: 40, color: '#eab308', emoji: '🟡' },
  { label: 'Good', score: 70, color: '#22c55e', emoji: '🟢' },
  { label: 'Easy', score: 90, color: '#06b6d4', emoji: '🔵' },
];

export default function ConceptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const completeConcept = useCompleteConcept();
  const reviewConcept = useReviewConcept();
  const [concept, setConcept] = useState<ConceptNode | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, boolean>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  React.useEffect(() => {
    if (id) {
      learningService.getConcept(id).then((c) => { setConcept(c); setLoading(false); });
    }
  }, [id]);

  if (loading || !concept) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg, paddingHorizontal: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.xl }} />
          <Skeleton width="80%" height={28} style={{ marginBottom: SPACING.sm }} />
          <Skeleton width="50%" height={14} style={{ marginBottom: SPACING.xxl }} />
          <Skeleton height={100} borderRadius={50} style={{ alignSelf: 'center', marginBottom: SPACING.xl }} />
          <Skeleton height={80} borderRadius={RADIUS.md} style={{ marginBottom: SPACING.md }} />
          <Skeleton height={60} borderRadius={RADIUS.md} />
        </View>
      </Screen>
    );
  }

  const diffColor = DIFF_COLORS[concept.difficulty] || '#94a3b8';
  const quizTerms = concept.key_definitions || [];
  const quizCorrectCount = Object.values(quizAnswers).filter(Boolean).length;

  const handleComplete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeConcept.mutate(
      { id: id!, score: 80 },
      { onSuccess: () => { Alert.alert('Concept Completed!', `+${concept.xp_earned || 80} XP earned`); router.back(); } }
    );
  };

  const handleReview = (score: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    reviewConcept.mutate({ id: id!, score });
  };

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ═══ BACK ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* ═══ TITLE AREA — typographic hero, no card ═══ */}
        <View style={{ paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.xl }}>
          {/* Difficulty + time — inline chips, not inside a card */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: diffColor }} />
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {concept.difficulty}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>·</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>~{concept.estimated_minutes} min</Text>
            {concept.xp_earned > 0 && (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>·</Text>
                <Text style={{ color: colors.xp, fontSize: 11, fontWeight: '600' }}>{concept.xp_earned} XP</Text>
              </>
            )}
          </View>
          {/* Title — large, no card */}
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800', lineHeight: 30 }}>
            {concept.title}
          </Text>
        </View>

        {/* ═══ MASTERY RING — visual state, not text ═══ */}
        {concept.mastery > 0 && (
          <View style={{ alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.sm }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              borderWidth: 4,
              borderColor: colors.muted,
              borderTopColor: concept.mastery > 0 ? '#22c55e' : colors.muted,
              borderRightColor: concept.mastery > 25 ? '#22c55e' : colors.muted,
              borderBottomColor: concept.mastery > 50 ? '#22c55e' : colors.muted,
              borderLeftColor: concept.mastery > 75 ? '#22c55e' : colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ color: '#22c55e', fontSize: 20, fontWeight: '800' }}>{concept.mastery}%</Text>
            </View>
            {concept.status === 'completed' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '700' }}>MASTERED</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: SPACING.xl }}>

          {/* ═══ SUMMARY — highlighted callout, not a card ═══ */}
          {concept.summary ? (
            <View style={{
              backgroundColor: colors.primary + '0A',
              borderLeftWidth: 3,
              borderLeftColor: colors.primary,
              borderRadius: RADIUS.sm,
              padding: SPACING.lg,
              marginBottom: SPACING.xl,
            }}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm }}>
                Key Takeaway
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, lineHeight: 24 }}>
                {concept.summary}
              </Text>
            </View>
          ) : null}

          {/* ═══ DESCRIPTION — plain text, no card ═══ */}
          {concept.description ? (
            <View style={{ marginBottom: SPACING.xl }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm }}>
                Why This Matters
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>
                {concept.description}
              </Text>
            </View>
          ) : null}

          {/* ═══ KEY DEFINITIONS — visual panels, not a list in a card ═══ */}
          {quizTerms.length > 0 && (
            <View style={{ marginBottom: SPACING.xl }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.md }}>
                Key Terms
              </Text>
              {quizTerms.map((def, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: RADIUS.md,
                    padding: SPACING.md,
                    marginBottom: 8,
                    borderLeftWidth: 3,
                    borderLeftColor: colors.accent,
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: FONT_SIZE.sm, fontWeight: '700' }}>{def.term}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 4, lineHeight: 18 }}>
                    {def.definition}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ═══ SELF-QUIZ — interactive, tactile ═══ */}
          {quizTerms.length > 0 && (
            <View style={{ marginBottom: SPACING.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Self-Quiz
                </Text>
                {quizSubmitted && (
                  <Text style={{ color: quizCorrectCount >= Math.min(quizTerms.length, 5) / 2 ? '#22c55e' : '#ef4444', fontSize: 12, fontWeight: '700' }}>
                    {quizCorrectCount}/{Math.min(quizTerms.length, 5)}
                  </Text>
                )}
              </View>

              {quizTerms.slice(0, 5).map((def, i) => (
                <View key={i} style={{ marginBottom: SPACING.md }}>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '500', marginBottom: 8 }}>
                    {def.term}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        if (!quizSubmitted) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setQuizAnswers((p) => ({ ...p, [i]: true }));
                        }
                      }}
                      activeOpacity={0.7}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: RADIUS.md,
                        alignItems: 'center',
                        backgroundColor: quizAnswers[i] === true ? '#22c55e' : 'transparent',
                        borderWidth: 1.5,
                        borderColor: quizAnswers[i] === true ? '#22c55e' : colors.border,
                      }}
                    >
                      <Text style={{
                        color: quizAnswers[i] === true ? '#fff' : colors.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}>
                        Got it ✓
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (!quizSubmitted) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setQuizAnswers((p) => ({ ...p, [i]: false }));
                        }
                      }}
                      activeOpacity={0.7}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: RADIUS.md,
                        alignItems: 'center',
                        backgroundColor: quizAnswers[i] === false ? '#ef4444' : 'transparent',
                        borderWidth: 1.5,
                        borderColor: quizAnswers[i] === false ? '#ef4444' : colors.border,
                      }}
                    >
                      <Text style={{
                        color: quizAnswers[i] === false ? '#fff' : colors.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}>
                        Review ✗
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {!quizSubmitted && Object.keys(quizAnswers).length >= Math.min(quizTerms.length, 5) && (
                <TouchableOpacity
                  onPress={() => {
                    setQuizSubmitted(true);
                    const score = Math.round((quizCorrectCount / Math.min(quizTerms.length, 5)) * 100);
                    handleReview(score);
                  }}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: RADIUS.md,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginTop: SPACING.sm,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Submit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ═══ SELF-ASSESSMENT — color-coded, tactile ═══ */}
          <View style={{ marginBottom: SPACING.xl }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.md }}>
              How well did you know this?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ASSESS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => handleReview(opt.score)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: RADIUS.md,
                    backgroundColor: opt.color,
                    alignItems: 'center',
                    shadowColor: opt.color,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ═══ COMPLETE — celebration CTA ═══ */}
          {concept.status !== 'completed' && (
            <TouchableOpacity
              onPress={handleComplete}
              disabled={completeConcept.isPending}
              style={{
                backgroundColor: '#22c55e',
                borderRadius: RADIUS.lg,
                paddingVertical: 16,
                alignItems: 'center',
                shadowColor: '#22c55e',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 6,
                marginBottom: SPACING.md,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                {completeConcept.isPending ? 'Completing...' : 'Mark as Mastered 🎉'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Source citation */}
          {concept.source_resource_title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: SPACING.md }}>
              <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 10 }} numberOfLines={1}>
                {concept.source_resource_title}
                {concept.source_page ? ` · p.${concept.source_page}` : ''}
              </Text>
            </View>
          ) : null}

        </View>
      </ScrollView>
    </Screen>
  );
}
