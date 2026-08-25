import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, ProgressBar, Skeleton, Button } from '@/components/ui';
import { useResource, useResourceProgress } from '@/hooks/useResources';
import { useCompleteStep } from '@/hooks/useStudy';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { NoteSection, AiNotesJson } from '@/types';

function SectionCard({
  section,
  index,
  colors,
  onExpand,
  onAsk,
}: {
  section: NoteSection;
  index: number;
  colors: any;
  onExpand?: (index: number) => void;
  onAsk?: (title: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: RADIUS.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {/* Section Header */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(!expanded);
          if (!expanded && onExpand) onExpand(index);
        }}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: SPACING.lg,
          gap: SPACING.md,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.primary + '18',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '700' }}>
            {index + 1}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }} numberOfLines={2}>
            {section.title}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Expanded Content */}
      {expanded && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md }}>
          {/* Key Question */}
          {section.key_question ? (
            <View style={{ backgroundColor: colors.accent + '10', borderRadius: RADIUS.md, padding: SPACING.md, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
              <Text style={{ color: colors.accent, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                KEY QUESTION
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 20 }}>
                {section.key_question}
              </Text>
            </View>
          ) : null}

          {/* Plain English */}
          {section.plain_english ? (
            <View>
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                IN PLAIN ENGLISH
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>
                {section.plain_english}
              </Text>
            </View>
          ) : null}

          {/* Quick Summary */}
          {section.quick_summary ? (
            <View style={{ backgroundColor: colors.muted, borderRadius: RADIUS.md, padding: SPACING.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                QUICK SUMMARY
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 20 }}>
                {section.quick_summary}
              </Text>
            </View>
          ) : null}

          {/* Memory Trick */}
          {section.memory_trick ? (
            <View style={{ backgroundColor: '#22c55e' + '10', borderRadius: RADIUS.md, padding: SPACING.md, borderLeftWidth: 3, borderLeftColor: '#22c55e' }}>
              <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                MEMORY TRICK
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 20 }}>
                {section.memory_trick}
              </Text>
            </View>
          ) : null}

          {/* Deep Dive */}
          {section.deep_dive ? (
            <View>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                DEEP DIVE
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>
                {section.deep_dive}
              </Text>
            </View>
          ) : null}

          {/* ASCII Art */}
          {section.ascii_art ? (
            <View style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                VISUAL
              </Text>
              <Text style={{ color: colors.text, fontSize: 10, fontFamily: 'Courier', lineHeight: 14 }}>
                {section.ascii_art}
              </Text>
            </View>
          ) : null}

          {/* Mermaid Fallback */}
          {section.mermaid_diagram && !section.ascii_art ? (
            <View style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>
                DIAGRAM
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontStyle: 'italic' }}>
                Diagram available on web version
              </Text>
            </View>
          ) : null}

          {/* Ask about this */}
          {onAsk && (
            <TouchableOpacity
              onPress={() => onAsk(section.title)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm }}
            >
              <Ionicons name="chatbubble-ellipses" size={12} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                Ask Flow AI about this
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function StudyNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const resourceQuery = useResource(resourceId);
  const progressQuery = useResourceProgress(resourceId);
  const completeStep = useCompleteStep();
  const [currentSection, setCurrentSection] = useState(0);
  const sectionRefs = useRef<View[]>([]);

  const resource = resourceQuery.data;
  const progress = progressQuery.data;
  const notesJson = resource?.ai_notes_json as AiNotesJson | undefined;
  const sections = notesJson?.sections || [];

  const completedSteps = progress?.completed_steps || {};
  const isNotesCompleted = completedSteps.notes === true;

  const handleCompleteNotes = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeStep.mutate(
      { resourceId, step: 'notes', score: 100 },
      { onSuccess: () => router.back() }
    );
  }, [resourceId, completeStep]);

  if (resourceQuery.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.lg }} />
          <Skeleton width="60%" height={24} style={{ marginBottom: SPACING.lg }} />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={80} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.md }} />
          ))}
        </View>
      </Screen>
    );
  }

  if (!notesJson || sections.length === 0) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginLeft: SPACING.md }}>
            Study Notes
          </Text>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2 }}>
          <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} style={{ marginBottom: SPACING.lg }} />
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
            No notes available
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>
            Notes will be generated once processing completes.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }}>
              Study Notes
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
              {sections.length} sections
            </Text>
          </View>
          {isNotesCompleted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22c55e' + '15', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full }}>
              <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
              <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Completed</Text>
            </View>
          )}
        </View>

        {/* Progress */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
          <ProgressBar progress={sections.length > 0 ? ((currentSection + 1) / sections.length) * 100 : 0} height={4} />
        </View>

        {/* Section Navigator */}
        {sections.length > 1 && (
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
              {sections.map((section, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCurrentSection(index);
                  }}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor: currentSection === index ? colors.primary + '20' : colors.card,
                    borderRadius: RADIUS.full,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.xs,
                    borderWidth: 1,
                    borderColor: currentSection === index ? colors.primary : colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACING.xs,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: currentSection === index ? colors.primary : colors.muted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: currentSection === index ? '#ffffff' : colors.textSecondary,
                        fontSize: 10,
                        fontWeight: '700',
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: currentSection === index ? colors.primary : colors.textSecondary,
                      fontSize: FONT_SIZE.xs,
                      fontWeight: '600',
                      maxWidth: 120,
                    }}
                    numberOfLines={1}
                  >
                    {section.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Sections */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {sections.map((section, index) => (
            <SectionCard
              key={index}
              section={section}
              index={index}
              colors={colors}
              onExpand={(i) => setCurrentSection(i)}
              onAsk={(title) => router.push({ pathname: '/(tabs)/ai/chat' as any, params: { resourceId: resourceId, prompt: `Explain: ${title}` } })}
            />
          ))}
        </View>

        {/* Complete Button */}
        <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.lg }}>
          {isNotesCompleted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md }}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.md, fontWeight: '600' }}>
                +50 XP Earned
              </Text>
            </View>
          ) : (
            <Button
              title="Mark as Complete"
              variant="primary"
              onPress={handleCompleteNotes}
              loading={completeStep.isPending}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
