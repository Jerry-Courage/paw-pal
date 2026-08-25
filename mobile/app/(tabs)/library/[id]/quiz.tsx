import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, ProgressBar, Skeleton, Button } from '@/components/ui';
import { useQuizzes, useGenerateQuiz, useSubmitQuiz, useCompleteStep } from '@/hooks/useStudy';
import { useResourceProgress } from '@/hooks/useResources';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { Quiz, QuizSubmitResponse } from '@/types';

function QuestionCard({
  question,
  options,
  selectedAnswer,
  onSelect,
  showResult,
  correctAnswer,
  colors,
}: {
  question: string;
  options: string[];
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  showResult: boolean;
  correctAnswer: string;
  colors: any;
}) {
  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <View style={{ marginBottom: SPACING.xl }}>
      <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.lg, lineHeight: 24 }}>
        {question}
      </Text>
      <View style={{ gap: SPACING.sm }}>
        {options.map((option, index) => {
          const label = optionLabels[index];
          const isSelected = selectedAnswer === label;
          const isCorrect = label === correctAnswer;
          const showCorrect = showResult && isCorrect;
          const showWrong = showResult && isSelected && !isCorrect;

          return (
            <TouchableOpacity
              key={index}
              onPress={() => {
                if (showResult) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(label);
              }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: showCorrect
                  ? '#22c55e' + '15'
                  : showWrong
                  ? '#ef4444' + '15'
                  : isSelected
                  ? colors.primary + '15'
                  : colors.card,
                borderRadius: RADIUS.lg,
                padding: SPACING.md,
                borderWidth: 1.5,
                borderColor: showCorrect
                  ? '#22c55e'
                  : showWrong
                  ? '#ef4444'
                  : isSelected
                  ? colors.primary
                  : colors.border,
                gap: SPACING.md,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: showCorrect
                    ? '#22c55e'
                    : showWrong
                    ? '#ef4444'
                    : isSelected
                    ? colors.primary
                    : colors.muted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: showCorrect || showWrong || isSelected ? '#ffffff' : colors.textSecondary,
                    fontSize: FONT_SIZE.sm,
                    fontWeight: '700',
                  }}
                >
                  {showCorrect ? '✓' : showWrong ? '✗' : label}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  color: showCorrect ? '#22c55e' : showWrong ? '#ef4444' : colors.text,
                  fontSize: FONT_SIZE.sm,
                  lineHeight: 20,
                }}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const quizzesQuery = useQuizzes(resourceId);
  const generateQuiz = useGenerateQuiz();
  const submitQuiz = useSubmitQuiz();
  const completeStep = useCompleteStep();
  const progressQuery = useResourceProgress(resourceId);

  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizSubmitResponse | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const quizzes = quizzesQuery.data || [];
  const progress = progressQuery.data;
  const completedSteps = progress?.completed_steps || {};
  const isQuizCompleted = completedSteps.quiz === true;
  const isGenerating = generateQuiz.isPending;

  const handleSelectAnswer = useCallback((questionId: string, label: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: label }));
  }, []);

  const handleGenerateQuiz = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerationError(null);
    generateQuiz.mutate(
      { resourceId, options: { format: 'mcq', level: 'undergrad', count: 10 } },
      {
        onSuccess: (quiz) => {
          setSelectedQuiz(quiz);
          setCurrentQuestion(0);
          setAnswers({});
          setShowResult(false);
          setQuizResult(null);
          setSessionComplete(false);
        },
        onError: (error: any) => {
          const msg = error?.response?.data?.detail || 'Failed to generate quiz. Please try again.';
          setGenerationError(msg);
        },
      }
    );
  }, [resourceId]);

  const handleSubmitQuiz = useCallback(() => {
    if (!selectedQuiz) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const submitAnswers = selectedQuiz.questions.map((q) => ({
      question_id: q.id,
      selected_option: answers[q.id] || '',
    }));

    submitQuiz.mutate(
      { quizId: selectedQuiz.id, answers: submitAnswers },
      {
        onSuccess: (result) => {
          setQuizResult(result);
          setSessionComplete(true);
          if (!isQuizCompleted) {
            completeStep.mutate({ resourceId, step: 'quiz', score: Math.round(result.percentage) });
          }
        },
      }
    );
  }, [selectedQuiz, answers, resourceId, isQuizCompleted]);

  if (quizzesQuery.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.lg }} />
          <Skeleton width="60%" height={24} style={{ marginBottom: SPACING.lg }} />
          {[1, 2].map((i) => (
            <Skeleton key={i} height={100} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.md }} />
          ))}
        </View>
      </Screen>
    );
  }

  // Quiz selection screen
  if (!selectedQuiz) {
    return (
      <Screen safeArea={false} keyboardAvoid={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }}>
              Quiz
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
              {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''} available
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 100 }}>
          {quizzes.length === 0 && !isGenerating ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2, paddingHorizontal: SPACING.xxl }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
                <Ionicons name="help-circle-outline" size={36} color="#22c55e" />
              </View>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
                No quizzes yet
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 20 }}>
                Flow AI can generate a quiz from this resource to test your knowledge.
              </Text>
              {generationError && (
                <View style={{ backgroundColor: '#ef4444' + '15', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#ef4444' + '30', width: '100%' }}>
                  <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.xs, textAlign: 'center' }}>{generationError}</Text>
                </View>
              )}
              <Button
                title="Generate Quiz"
                variant="primary"
                onPress={handleGenerateQuiz}
              />
            </View>
          ) : isGenerating ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl, minHeight: 300 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
                <ActivityIndicator size="large" color="#22c55e" />
              </View>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
                Generating Quiz
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>
                AI is creating questions...
              </Text>
            </View>
          ) : (
            quizzes.map((quiz) => (
              <TouchableOpacity
                key={quiz.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedQuiz(quiz);
                  setCurrentQuestion(0);
                  setAnswers({});
                  setShowResult(false);
                  setQuizResult(null);
                  setSessionComplete(false);
                }}
                activeOpacity={0.7}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.lg,
                  marginBottom: SPACING.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="help-circle" size={22} color="#22c55e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>
                      {quiz.title || 'Quiz'}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                      {quiz.questions.length} questions · {quiz.format?.toUpperCase() || 'MCQ'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </Screen>
    );
  }

  // Session complete screen
  if (sessionComplete && quizResult) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
            <Ionicons name="trophy" size={36} color="#22c55e" />
          </View>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800', marginBottom: SPACING.sm }}>
            Quiz Complete!
          </Text>
          <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xxxl, fontWeight: '800', marginBottom: SPACING.sm }}>
            {Math.round(quizResult.percentage)}%
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.md, marginBottom: SPACING.lg }}>
            {quizResult.correct_answers} correct · {quizResult.incorrect_answers} incorrect
          </Text>
          {isQuizCompleted && (
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

  // Quiz in progress
  const questions = selectedQuiz.questions;
  const question = questions[currentQuestion];
  const totalAnswered = Object.keys(answers).length;
  const allAnswered = totalAnswered === questions.length;

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm }}>
          <TouchableOpacity
            onPress={() => {
              if (currentQuestion > 0) {
                setCurrentQuestion(currentQuestion - 1);
                setShowResult(false);
              } else {
                setSelectedQuiz(null);
              }
            }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }}>
              {selectedQuiz.title || 'Quiz'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
              Question {currentQuestion + 1} of {questions.length}
            </Text>
          </View>
        </View>

        {/* Progress */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
          <ProgressBar progress={questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0} height={4} />
        </View>

        {/* Question */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {question && (
            <QuestionCard
              question={question.question}
              options={question.options}
              selectedAnswer={answers[question.id] || null}
              onSelect={(label) => handleSelectAnswer(question.id, label)}
              showResult={showResult}
              correctAnswer={question.correct_answer}
              colors={colors}
            />
          )}

          {/* Explanation (after submitting) */}
          {showResult && question?.explanation && (
            <View style={{ backgroundColor: colors.accent + '10', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
              <Text style={{ color: colors.accent, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: SPACING.sm }}>
                EXPLANATION
              </Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>
                {question.explanation}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: '/(tabs)/ai/chat' as any,
                    params: { resourceId, prompt: `Why is the correct answer "${question.correct_answer}" for this question: ${question.question}` },
                  });
                }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md }}
              >
                <Ionicons name="chatbubble-ellipses" size={12} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Ask Flow AI to explain why</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Navigation */}
        <View style={{ paddingHorizontal: SPACING.lg, flexDirection: 'row', gap: SPACING.sm }}>
          {!showResult ? (
            <Button
              title="Check Answer"
              variant="primary"
              fullWidth
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowResult(true);
              }}
              disabled={!answers[question?.id]}
            />
          ) : currentQuestion < questions.length - 1 ? (
            <Button
              title="Next Question"
              variant="primary"
              fullWidth
              onPress={() => {
                setCurrentQuestion(currentQuestion + 1);
                setShowResult(false);
              }}
            />
          ) : (
            <Button
              title="Submit Quiz"
              variant="primary"
              fullWidth
              onPress={handleSubmitQuiz}
              loading={submitQuiz.isPending}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
