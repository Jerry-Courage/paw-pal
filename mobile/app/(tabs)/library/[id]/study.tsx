import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, ProgressBar, Skeleton } from '@/components/ui';
import { useResource, useResourceProgress } from '@/hooks/useResources';
import { useFlashcards, useQuizzes, useDueFlashcards } from '@/hooks/useStudy';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const STUDY_TOOLS = [
  {
    key: 'notes',
    icon: 'book',
    label: 'Study Notes',
    description: 'AI-generated structured notes with memory tricks',
    color: '#f97316',
    bgOpacity: '18',
  },
  {
    key: 'flashcards',
    icon: 'albums',
    label: 'Flashcards',
    description: 'Spaced repetition flashcards for memorization',
    color: '#8b5cf6',
    bgOpacity: '18',
  },
  {
    key: 'quiz',
    icon: 'help-circle',
    label: 'Quiz',
    description: 'Multiple choice quiz to test your knowledge',
    color: '#22c55e',
    bgOpacity: '18',
  },
];

export default function StudyHubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const resourceQuery = useResource(resourceId);
  const progressQuery = useResourceProgress(resourceId);
  const flashcardsQuery = useFlashcards(resourceId);
  const quizzesQuery = useQuizzes(resourceId);
  const dueFlashcardsQuery = useDueFlashcards();

  const resource = resourceQuery.data;
  const progress = progressQuery.data;
  const dueCount = dueFlashcardsQuery.data?.length || 0;
  const flashcardCount = flashcardsQuery.data?.length || 0;
  const quizCount = quizzesQuery.data?.length || 0;

  if (resourceQuery.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.lg }} />
          <Skeleton width="70%" height={24} style={{ marginBottom: SPACING.sm }} />
          <Skeleton width="40%" height={14} style={{ marginBottom: SPACING.xl }} />
          <Skeleton height={120} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.xl }} />
          <Skeleton height={100} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.md }} />
          <Skeleton height={100} borderRadius={RADIUS.lg} />
        </View>
      </Screen>
    );
  }

  if (resourceQuery.isError || !resource) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2 }}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} style={{ marginBottom: SPACING.lg }} />
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
            Resource not found
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: colors.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full }}>
            <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.sm, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const hasStudyKit = resource.has_study_kit;
  const isProcessing = resource.status === 'processing';

  const navigateToTool = (toolKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const routes: Record<string, string> = {
      notes: `/(tabs)/library/${resourceId}/notes`,
      flashcards: `/(tabs)/library/${resourceId}/flashcards`,
      quiz: `/(tabs)/library/${resourceId}/quiz`,
    };
    if (routes[toolKey]) router.push(routes[toolKey] as any);
  };

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }} numberOfLines={1}>
              Study Mode
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }} numberOfLines={1}>
              {resource.title}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {/* Progress Card */}
          {progress && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Overall Mastery</Text>
                <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '700' }}>
                  {progress.mastery}%
                </Text>
              </View>
              <ProgressBar progress={progress.mastery} height={8} />
              <View style={{ flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {progress.completed_count}/{progress.step_order.length} completed
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {progress.xp_earned} XP earned
                </Text>
              </View>
            </View>
          )}

          {/* Processing Banner */}
          {isProcessing && (
            <View style={{ backgroundColor: colors.warning + '15', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: colors.warning + '30' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <Ionicons name="sync" size={16} color={colors.warning} />
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>
                  Processing... {resource.processing_progress}%
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: SPACING.sm }}>
                Study tools will be available once processing completes.
              </Text>
            </View>
          )}

          {/* Study Tools */}
          {!isProcessing && (
            <>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>
                Study Tools
              </Text>
              <View style={{ gap: SPACING.sm }}>
                {STUDY_TOOLS.map((tool) => {
                  const completedSteps = progress?.completed_steps || {};
                  const isCompleted = completedSteps[tool.key] === true;
                  const flashcardsDue = tool.key === 'flashcards' && dueCount > 0;
                  const hasFlashcards = tool.key === 'flashcards' && flashcardCount > 0;
                  const hasQuiz = tool.key === 'quiz' && quizCount > 0;
                  const noFlashcards = tool.key === 'flashcards' && flashcardCount === 0 && !flashcardsQuery.isLoading;
                  const noQuiz = tool.key === 'quiz' && quizCount === 0 && !quizzesQuery.isLoading;
                  const subtitle = tool.key === 'notes'
                    ? tool.description
                    : tool.key === 'flashcards'
                    ? hasFlashcards
                      ? `${flashcardCount} cards${dueCount > 0 ? ` \u00b7 ${dueCount} due` : ''}`
                      : 'Not generated yet'
                    : tool.key === 'quiz'
                    ? hasQuiz
                      ? `${quizCount} questions`
                      : 'Not generated yet'
                    : tool.description;
                  return (
                    <TouchableOpacity
                      key={tool.key}
                      onPress={() => navigateToTool(tool.key)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.card,
                        borderRadius: RADIUS.lg,
                        padding: SPACING.lg,
                        borderWidth: 1,
                        borderColor: isCompleted ? tool.color + '40' : colors.border,
                        gap: SPACING.md,
                      }}
                    >
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tool.color + tool.bgOpacity, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={tool.icon as any} size={22} color={tool.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>{tool.label}</Text>
                          {isCompleted && (
                            <Ionicons name="checkmark-circle" size={14} color={tool.color} />
                          )}
                        </View>
                        <Text style={{ color: (noFlashcards || noQuiz) ? colors.textSecondary : colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
                          {subtitle}
                        </Text>
                      </View>
                      {flashcardsDue ? (
                        <View style={{ backgroundColor: tool.color + '18', paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full }}>
                          <Text style={{ color: tool.color, fontSize: 10, fontWeight: '700' }}>
                            {dueCount} due
                          </Text>
                        </View>
                      ) : (noFlashcards || noQuiz) ? (
                        <View style={{ backgroundColor: tool.color + '18', paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full }}>
                          <Text style={{ color: tool.color, fontSize: 10, fontWeight: '700' }}>
                            Generate
                          </Text>
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Start Session Button */}
          {!isProcessing && hasStudyKit && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push(`/(tabs)/library/${resourceId}/study-session` as any);
              }}
              activeOpacity={0.7}
              style={{
                marginTop: SPACING.xl,
                backgroundColor: colors.primary,
                borderRadius: RADIUS.lg,
                paddingVertical: SPACING.lg,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>
                Start Study Session
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
