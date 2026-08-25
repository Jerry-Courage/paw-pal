import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button } from '@/components/ui';
import { useCreateBattle, useGenerateBattle } from '@/hooks/useQuizBattle';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function BattleCreateScreen() {
  const colors = useThemeColors();
  const createBattle = useCreateBattle();
  const generateBattle = useGenerateBattle();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState('10');
  const [timePerQ, setTimePerQ] = useState('20');
  const [difficulty, setDifficulty] = useState('medium');

  const handleGenerate = () => {
    if (!title.trim()) { Alert.alert('Error', 'Enter a battle title.'); return; }
    if (!topic.trim()) { Alert.alert('Error', 'Enter a topic for AI generation.'); return; }

    const payload = {
      topic: topic.trim(),
      count: parseInt(questionCount) || 10,
      time_per_q: parseInt(timePerQ) || 20,
      title: title.trim(),
      difficulty,
    };

    generateBattle.mutate(payload, {
      onSuccess: (room) => {
        router.replace({ pathname: '/(tabs)/more/battle/[pin]', params: { pin: room.pin } });
      },
      onError: (err: any) => {
        const body = err?.response?.data;
        const msg = body?.error || body?.detail || body?.message || err?.message || 'Unknown error';
        Alert.alert('Error', msg);
      },
    });
  };

  const handleCreateManual = () => {
    if (!title.trim()) { Alert.alert('Error', 'Enter a battle title.'); return; }

    const payload = {
      title: title.trim(),
      time_per_q: parseInt(timePerQ) || 20,
      questions: undefined,
    };

    createBattle.mutate(payload, {
      onSuccess: (room) => {
        router.replace({ pathname: '/(tabs)/more/battle/[pin]', params: { pin: room.pin } });
      },
      onError: (err: any) => {
        const body = err?.response?.data;
        const msg = body?.error || body?.detail || body?.message || err?.message || 'Unknown error';
        Alert.alert('Error', msg);
      },
    });
  };

  return (
    <Screen safeArea={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Create Battle</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {/* Mode Toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: 3, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
            {(['ai', 'manual'] as const).map((m) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={{ flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md - 2, backgroundColor: mode === m ? colors.primary : 'transparent', alignItems: 'center' }}>
                <Text style={{ color: mode === m ? '#ffffff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{m === 'ai' ? 'AI Generate' : 'Manual'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <View style={{ marginBottom: SPACING.md }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs }}>BATTLE TITLE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Biology Chapter 5 Quiz" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }} />
          </View>

          {mode === 'ai' ? (
            <>
              <View style={{ marginBottom: SPACING.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs }}>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>TOPIC</Text>
                  <View style={{ backgroundColor: '#f97316' + '20', borderRadius: RADIUS.sm, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Text style={{ color: '#f97316', fontSize: 8, fontWeight: '700' }}>REQUIRED</Text>
                  </View>
                </View>
                <TextInput value={topic} onChangeText={setTopic} placeholder="e.g. Cell biology, photosynthesis" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: topic.trim() ? colors.border : '#f97316' + '60', marginBottom: SPACING.xs }} />
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>AI needs a topic to generate questions</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs }}>QUESTIONS</Text>
                  <TextInput value={questionCount} onChangeText={setQuestionCount} keyboardType="numeric" style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, textAlign: 'center' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs }}>TIME PER Q (sec)</Text>
                  <TextInput value={timePerQ} onChangeText={setTimePerQ} keyboardType="numeric" style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, textAlign: 'center' }} />
                </View>
              </View>

              <View style={{ marginBottom: SPACING.xl }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs }}>DIFFICULTY</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  {(['easy', 'medium', 'hard'] as const).map((d) => (
                    <TouchableOpacity key={d} onPress={() => setDifficulty(d)} style={{ flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: difficulty === d ? colors.primary + '20' : colors.card, borderWidth: 1, borderColor: difficulty === d ? colors.primary : colors.border, alignItems: 'center' }}>
                      <Text style={{ color: difficulty === d ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Button
                title={generateBattle.isPending ? 'Generating...' : 'Generate & Start'}
                variant="primary"
                onPress={handleGenerate}
                disabled={!title.trim() || !topic.trim() || generateBattle.isPending}
              />
              {generateBattle.isPending && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>AI is creating questions...</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs }}>TIME PER QUESTION (sec)</Text>
                <TextInput value={timePerQ} onChangeText={setTimePerQ} keyboardType="numeric" style={{ backgroundColor: colors.card, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, textAlign: 'center' }} />
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.md }}>Questions can be added via the web interface. This creates an empty battle room.</Text>
              <Button title={createBattle.isPending ? 'Creating...' : 'Create Battle'} variant="primary" onPress={handleCreateManual} disabled={!title.trim() || createBattle.isPending} />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
