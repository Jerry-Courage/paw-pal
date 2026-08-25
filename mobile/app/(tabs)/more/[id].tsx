import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton, Button } from '@/components/ui';
import { useAssignment, useSolveAssignment, useRefineAssignment } from '@/hooks/useAssignments';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const assignmentQuery = useAssignment(Number(id));
  const solveMutation = useSolveAssignment();
  const refineMutation = useRefineAssignment();
  const [activeTab, setActiveTab] = useState<'overview' | 'outline' | 'solve' | 'refine'>('overview');
  const [refinePrompt, setRefinePrompt] = useState('');

  const a = assignmentQuery.data;

  if (assignmentQuery.isLoading) {
    return (
      <Screen safeArea={false}>
        <Skeleton height={50} borderRadius={RADIUS.lg} style={{ margin: SPACING.lg }} />
        <Skeleton height={300} borderRadius={RADIUS.lg} style={{ marginHorizontal: SPACING.lg }} />
      </Screen>
    );
  }

  if (!a) {
    return (
      <Screen safeArea={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.md, marginTop: SPACING.md }}>Assignment not found</Text>
          <Button title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: SPACING.md }} />
        </View>
      </Screen>
    );
  }

  const statusColors: Record<string, string> = { pending: '#eab308', processing: '#8b5cf6', completed: '#22c55e', error: '#ef4444' };
  const statusColor = statusColors[a.status] || '#94a3b8';
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'document-text' },
    { key: 'outline', label: 'Outline', icon: 'list' },
    { key: 'solve', label: 'AI Solve', icon: 'sparkles' },
    { key: 'refine', label: 'Refine', icon: 'create' },
  ] as const;

  const renderContent = () => {
    if (activeTab === 'overview') {
      return (
        <View>
          {a.instructions && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm }}>INSTRUCTIONS</Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 20 }}>{a.instructions}</Text>
            </View>
          )}
          {a.file && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
              <Ionicons name="document-attach" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, flex: 1 }} numberOfLines={1}>{a.file_name || 'Attached file'}</Text>
            </View>
          )}
          {a.sources && a.sources.length > 0 && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm }}>SOURCES ({a.sources.length})</Text>
              {a.sources.map((src) => (
                <Text key={src.id} style={{ color: colors.text, fontSize: FONT_SIZE.sm }}>{src.file_name}</Text>
              ))}
            </View>
          )}
          {!a.instructions && !a.file && (!a.sources || a.sources.length === 0) && (
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>No description provided. Use AI Solve to generate a solution.</Text>
          )}
        </View>
      );
    }

    if (activeTab === 'outline') {
      return (
        <View>
          {a.ai_outline && a.ai_outline.length > 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              {a.ai_outline.map((item, idx) => (
                <Text key={idx} style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22, marginBottom: SPACING.xs }}>{idx + 1}. {item}</Text>
              ))}
            </View>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="list-outline" size={32} color={colors.textSecondary} style={{ marginBottom: SPACING.sm }} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>No outline generated yet. Use AI Solve first.</Text>
            </View>
          )}
        </View>
      );
    }

    if (activeTab === 'solve') {
      return (
        <View>
          {a.ai_response ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>{a.ai_response}</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="sparkles" size={32} color={colors.primary} style={{ marginBottom: SPACING.sm }} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 4 }}>AI Assignment Solver</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.md }}>Flow AI will solve this assignment step by step</Text>
              <Button title={solveMutation.isPending ? 'Solving...' : 'Solve with AI'} variant="primary" onPress={() => solveMutation.mutate(a.id)} disabled={solveMutation.isPending} />
            </View>
          )}
          {a.ai_overview && a.ai_response && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm }}>AI OVERVIEW</Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>{a.ai_overview}</Text>
            </View>
          )}
        </View>
      );
    }

    if (activeTab === 'refine') {
      return (
        <View>
          {a.ai_response ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="create-outline" size={32} color="#8b5cf6" style={{ marginBottom: SPACING.sm }} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 4 }}>Refine Solution</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.md }}>Flow AI will improve the existing solution</Text>
              <TextInput
                value={refinePrompt}
                onChangeText={setRefinePrompt}
                placeholder="How should we refine it?"
                placeholderTextColor={colors.textSecondary}
                style={{ width: '100%', backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm, textAlignVertical: 'top' }}
                multiline
                numberOfLines={3}
              />
              <Button
                title={refineMutation.isPending ? 'Refining...' : 'Refine with AI'}
                variant="primary"
                onPress={() => refineMutation.mutate({ id: a.id, prompt: refinePrompt || 'Improve and refine the solution' })}
                disabled={refineMutation.isPending || !refinePrompt.trim()}
              />
            </View>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>Solve the assignment first, then refine it.</Text>
            </View>
          )}
        </View>
      );
    }
  };

  return (
    <Screen safeArea={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '800' }} numberOfLines={1}>{a.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
              <Text style={{ color: statusColor, fontSize: 10, fontWeight: '600' }}>{a.status.replace('_', ' ').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, gap: SPACING.xs }}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab.key); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: activeTab === tab.key ? colors.primary + '18' : 'transparent', borderWidth: 1, borderColor: activeTab === tab.key ? colors.primary : colors.border }}
            >
              <Ionicons name={tab.icon as any} size={12} color={activeTab === tab.key ? colors.primary : colors.textSecondary} />
              <Text style={{ color: activeTab === tab.key ? colors.primary : colors.textSecondary, fontSize: 10, fontWeight: '600' }}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {renderContent()}
        </View>
      </ScrollView>
    </Screen>
  );
}
