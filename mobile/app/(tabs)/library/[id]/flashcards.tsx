import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, ProgressBar, Skeleton, Button } from '@/components/ui';
import { useFlashcards, useGenerateFlashcards, useReviewFlashcard, useCompleteStep } from '@/hooks/useStudy';
import { useResourceProgress } from '@/hooks/useResources';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { Flashcard, PreviewCard } from '@/types';

const QUALITY_OPTIONS = [
  { value: 1, label: 'Skip', color: '#ef4444', icon: 'close-circle' },
  { value: 3, label: 'Hard', color: '#eab308', icon: 'alert-circle' },
  { value: 4, label: 'Know', color: '#22c55e', icon: 'checkmark-circle' },
  { value: 5, label: 'Easy', color: '#06b6d4', icon: 'rocket' },
];

function FlashcardView({
  card,
  isFlipped,
  onFlip,
  colors,
}: {
  card: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
  colors: any;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onFlip();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={{
          backgroundColor: isFlipped ? colors.accent + '10' : colors.card,
          borderRadius: RADIUS.xl,
          padding: SPACING.xxl,
          minHeight: 280,
          borderWidth: 2,
          borderColor: isFlipped ? colors.accent + '40' : colors.border,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Card label */}
        <View style={{ position: 'absolute', top: SPACING.lg, left: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
            {isFlipped ? 'ANSWER' : 'QUESTION'}
          </Text>
        </View>

        {/* Difficulty badge */}
        <View style={{ position: 'absolute', top: SPACING.lg, right: SPACING.lg }}>
          <View
            style={{
              backgroundColor: card.difficulty === 'easy' ? '#22c55e' + '18' : card.difficulty === 'hard' ? '#ef4444' + '18' : colors.muted,
              paddingHorizontal: SPACING.sm,
              paddingVertical: 2,
              borderRadius: RADIUS.full,
            }}
          >
            <Text
              style={{
                color: card.difficulty === 'easy' ? '#22c55e' : card.difficulty === 'hard' ? '#ef4444' : colors.textSecondary,
                fontSize: 10,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              {card.difficulty}
            </Text>
          </View>
        </View>

        {/* Content */}
        <Text
          style={{
            color: colors.text,
            fontSize: isFlipped ? FONT_SIZE.md : FONT_SIZE.lg,
            fontWeight: isFlipped ? '400' : '700',
            textAlign: 'center',
            lineHeight: isFlipped ? 24 : 28,
          }}
        >
          {isFlipped ? card.answer : card.question}
        </Text>

        {/* Tap hint */}
        <View style={{ position: 'absolute', bottom: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
            Tap to {isFlipped ? 'see question' : 'reveal answer'}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function FlashcardsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const flashcardsQuery = useFlashcards(resourceId);
  const generateFlashcards = useGenerateFlashcards();
  const reviewFlashcard = useReviewFlashcard();
  const completeStep = useCompleteStep();
  const progressQuery = useResourceProgress(resourceId);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<PreviewCard[] | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const cards = flashcardsQuery.data || [];
  const progress = progressQuery.data;
  const completedSteps = progress?.completed_steps || {};
  const isFlashcardsCompleted = completedSteps.flashcards === true;

  const isGenerating = generateFlashcards.isPending;
  const hasGeneratedPreview = generatedCards && generatedCards.length > 0;
  const displayCards = hasGeneratedPreview
    ? generatedCards.map((c, i) => ({
        id: i,
        deck: null,
        resource: resourceId,
        question: c.question,
        answer: c.answer,
        subject: '',
        difficulty: c.difficulty,
        created_at: new Date().toISOString(),
      }))
    : cards;

  const currentCard = displayCards[currentIndex];

  const handleReview = useCallback(
    (quality: number) => {
      if (!currentCard) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      reviewFlashcard.mutate(
        { flashcardId: currentCard.id, quality },
        {
          onSuccess: () => {
            const newCount = reviewedCount + 1;
            setReviewedCount(newCount);

            if (currentIndex < displayCards.length - 1) {
              setIsFlipped(false);
              setCurrentIndex(currentIndex + 1);
            } else {
              setSessionComplete(true);
              if (!isFlashcardsCompleted) {
                completeStep.mutate({ resourceId, step: 'flashcards', score: 80 });
              }
            }
          },
        }
      );
    },
    [currentCard, currentIndex, displayCards.length, reviewedCount, resourceId, isFlashcardsCompleted]
  );

  const handleGenerate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerationError(null);
    setGeneratedCards(null);
    generateFlashcards.mutate(
      { resourceId },
      {
        onSuccess: (cards) => {
          setGeneratedCards(cards);
          setCurrentIndex(0);
          setIsFlipped(false);
        },
        onError: (error: any) => {
          const msg = error?.response?.data?.detail || 'Failed to generate flashcards. Please try again.';
          setGenerationError(msg);
        },
      }
    );
  }, [resourceId]);

  if (flashcardsQuery.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.lg }} />
          <Skeleton width="60%" height={24} style={{ marginBottom: SPACING.lg }} />
          <Skeleton height={280} borderRadius={RADIUS.xl} />
        </View>
      </Screen>
    );
  }

  if (cards.length === 0 && !hasGeneratedPreview) {
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
            Flashcards
          </Text>
        </View>

        {isGenerating ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
              <ActivityIndicator size="large" color="#8b5cf6" />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
              Generating Flashcards
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>
              AI is extracting key concepts...
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2, paddingHorizontal: SPACING.xxl }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
              <Ionicons name="albums-outline" size={36} color="#8b5cf6" />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
              No flashcards yet
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 20 }}>
              Flow AI can generate a flashcard deck from this resource to help you memorize key concepts.
            </Text>
            {generationError && (
              <View style={{ backgroundColor: '#ef4444' + '15', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#ef4444' + '30', width: '100%' }}>
                <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.xs, textAlign: 'center' }}>{generationError}</Text>
              </View>
            )}
            <Button
              title="Generate Flashcards"
              variant="primary"
              onPress={handleGenerate}
            />
          </View>
        )}
      </Screen>
    );
  }

  if (sessionComplete) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
            <Ionicons name="trophy" size={36} color="#22c55e" />
          </View>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800', marginBottom: SPACING.sm }}>
            Session Complete!
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.md, textAlign: 'center', marginBottom: SPACING.md }}>
            You reviewed {reviewedCount} flashcards
          </Text>
          {isFlashcardsCompleted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              <Ionicons name="star" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.md, fontWeight: '600' }}>
                +10 XP Earned
              </Text>
            </View>
          )}
          <Button
            title="Done"
            variant="primary"
            onPress={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
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
            Flashcards
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
            {currentIndex + 1}/{displayCards.length}
          </Text>
        </View>
        {isFlashcardsCompleted && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22c55e' + '15', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full }}>
            <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
            <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Completed</Text>
          </View>
        )}
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
        <ProgressBar progress={displayCards.length > 0 ? ((currentIndex + 1) / displayCards.length) * 100 : 0} height={4} />
      </View>

      {/* Card */}
      <View style={{ paddingHorizontal: SPACING.lg, flex: 1, justifyContent: 'center' }}>
        {currentCard && (
          <FlashcardView
            card={currentCard}
            isFlipped={isFlipped}
            onFlip={() => setIsFlipped(!isFlipped)}
            colors={colors}
          />
        )}

        {/* Ask AI about this card */}
        {isFlipped && currentCard && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: '/(tabs)/ai/chat' as any,
                params: { resourceId, prompt: `Explain this flashcard answer: Q: ${currentCard.question} A: ${currentCard.answer}` },
              });
            }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, marginTop: SPACING.md }}
          >
            <Ionicons name="chatbubble-ellipses" size={12} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Ask Flow AI about this</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quality Buttons */}
      {isFlipped && (
        <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xxxl }}>
          {QUALITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => handleReview(option.value)}
              disabled={reviewFlashcard.isPending}
              activeOpacity={0.7}
              style={{
                flex: 1,
                backgroundColor: option.color + '15',
                borderRadius: RADIUS.lg,
                paddingVertical: SPACING.md,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: option.color + '30',
                gap: 4,
              }}
            >
              <Ionicons name={option.icon as any} size={20} color={option.color} />
              <Text style={{ color: option.color, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Flip Button (when not flipped) */}
      {!isFlipped && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxxl }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsFlipped(true);
            }}
            activeOpacity={0.7}
            style={{
              backgroundColor: colors.primary,
              borderRadius: RADIUS.lg,
              paddingVertical: SPACING.lg,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>
              Reveal Answer
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}
