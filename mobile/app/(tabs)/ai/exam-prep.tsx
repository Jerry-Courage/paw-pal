import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Button, Skeleton } from '@/components/ui';
import { useResource } from '@/hooks/useResources';
import { useExamPrep } from '@/hooks/useExamPrep';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const TECHNIQUES = [
  { key: 'feynman', icon: 'mic', label: 'Feynman Method', desc: 'Explain concepts in simple terms. AI listens and guides.', color: '#f97316' },
  { key: 'active_recall', icon: 'chatbubble', label: 'Active Recall', desc: 'AI quizzes you and evaluates your answers.', color: '#8b5cf6' },
  { key: 'socratic', icon: 'help-circle', label: 'Socratic Method', desc: 'AI asks guiding questions to deepen understanding.', color: '#22c55e' },
  { key: 'free_chat', icon: 'call', label: 'Free Chat', desc: 'Open conversation about your study material.', color: '#06b6d4' },
];

export default function ExamPrepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const resourceQuery = useResource(resourceId);
  const examPrep = useExamPrep(resourceId);
  const [inputText, setInputText] = useState('');

  const resource = resourceQuery.data;

  const handleStart = useCallback((technique: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const sections = (resource?.ai_notes_json as any)?.sections?.slice(0, 10) || [];
    const context = sections.map((s: any) => `${s.title}: ${(s.plain_english || s.deep_dive || '').slice(0, 300)}`).join('\n\n');
    examPrep.startSession(technique, resource?.title || '', context);
  }, [resource, examPrep]);

  const handleSendText = useCallback(() => {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    examPrep.sendTextMessage(inputText.trim());
    setInputText('');
  }, [inputText, examPrep]);

  // Report screen
  if (examPrep.phase === 'report' && examPrep.report) {
    return (
      <Screen safeArea={false}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
          <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg }}>
              <Ionicons name="trophy" size={36} color="#22c55e" />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800', marginBottom: SPACING.xs }}>
              Session Complete
            </Text>
            <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xxxl, fontWeight: '800' }}>
              {examPrep.report.score}%
            </Text>
          </View>

          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.sm }}>Summary</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>{examPrep.report.summary}</Text>
          </View>

          {examPrep.report.strengths.length > 0 && (
            <View style={{ backgroundColor: '#22c55e' + '10', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#22c55e' + '30' }}>
              <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: SPACING.sm }}>STRENGTHS</Text>
              {examPrep.report.strengths.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs }}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, flex: 1 }}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {examPrep.report.gaps.length > 0 && (
            <View style={{ backgroundColor: '#ef4444' + '10', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#ef4444' + '30' }}>
              <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: SPACING.sm }}>AREAS TO IMPROVE</Text>
              {examPrep.report.gaps.map((g, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs }}>
                  <Ionicons name="alert-circle" size={14} color="#ef4444" />
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, flex: 1 }}>{g}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: SPACING.sm }}>RECOMMENDATION</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>{examPrep.report.recommendation}</Text>
          </View>

          <Button title="Done" variant="primary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  // Active session
  if (examPrep.phase === 'session') {
    return (
      <Screen safeArea={false} keyboardAvoid={false}>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
            <TouchableOpacity
              onPress={() => { examPrep.endSession(); router.back(); }}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>
                Exam Prep
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: examPrep.isConnected ? '#22c55e' : '#ef4444' }} />
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {examPrep.statusMessage || (examPrep.isConnected ? 'Connected' : 'Disconnected')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { examPrep.endSession(); router.back(); }}
              style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: '#ef4444' + '15', borderRadius: RADIUS.full }}
            >
              <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.xs, fontWeight: '600' }}>End</Text>
            </TouchableOpacity>
          </View>

          {/* Transcript */}
          <FlatList
            data={examPrep.transcript}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.sm }}
            renderItem={({ item }) => (
              <View style={{
                marginBottom: SPACING.md,
                alignItems: item.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <View style={{
                  maxWidth: '85%',
                  backgroundColor: item.role === 'user' ? colors.primary : colors.card,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  borderWidth: item.role === 'user' ? 0 : 1,
                  borderColor: colors.border,
                }}>
                  <Text style={{ color: item.role === 'user' ? '#ffffff' : colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>
                    {item.text}
                  </Text>
                </View>
              </View>
            )}
          />

          {/* Text input */}
          <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your response..."
              placeholderTextColor={colors.textSecondary}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: RADIUS.lg,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                color: colors.text,
                fontSize: FONT_SIZE.sm,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <TouchableOpacity
              onPress={handleSendText}
              disabled={!inputText.trim()}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: inputText.trim() ? colors.primary : colors.muted,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="arrow-up" size={20} color={inputText.trim() ? '#ffffff' : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </Screen>
    );
  }

  // Setup screen
  return (
    <Screen safeArea={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginLeft: SPACING.md }}>
            Exam Prep
          </Text>
        </View>

        {resource && (
          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: 4 }}>STUDYING</Text>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }} numberOfLines={2}>{resource.title}</Text>
          </View>
        )}

        <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>
          Choose a technique
        </Text>

        <View style={{ gap: SPACING.sm }}>
          {TECHNIQUES.map((tech) => (
            <TouchableOpacity
              key={tech.key}
              onPress={() => handleStart(tech.key)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.card,
                borderRadius: RADIUS.lg,
                padding: SPACING.lg,
                borderWidth: 1,
                borderColor: colors.border,
                gap: SPACING.md,
              }}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tech.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={tech.icon as any} size={22} color={tech.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>{tech.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>{tech.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
