import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import FlowScreen from '@/components/flow/FlowScreen';
import FlowCard from '@/components/flow/FlowCard';
import { useThemeColors } from '@/hooks/useTheme';
import { aiService } from '@/services/ai';
import { SPACING, RADIUS, FONT_SIZE, TYPOGRAPHY } from '@/constants/theme';
import { ChatSession } from '@/types';

const QUICK_MODES = [
  { key: 'tutor', label: 'Live Tutor', icon: 'call' as const, bg: '#8b5cf6', route: '/(tabs)/ai/chat', params: { mode: 'tutor' } },
  { key: 'camera', label: 'Camera', icon: 'camera' as const, bg: '#06b6d4', route: '/(tabs)/flow/chat' as const },
  { key: 'exam', label: 'Exam Prep', icon: 'school' as const, bg: '#22c55e', route: '/(tabs)/ai/exam-prep' as const },
  { key: 'math', label: 'Math', icon: 'calculator' as const, bg: '#ef4444', route: '/(tabs)/ai/math-solver' as const },
  { key: 'podcast', label: 'Podcast', icon: 'headset' as const, bg: '#8b5cf6', route: '/(tabs)/flow/chat' as const },
  { key: 'voice', label: 'Voice', icon: 'mic' as const, bg: '#FF7A1A', route: '/(tabs)/flow/chat' as const },
];

export default function FlowScreenPage() {
  const colors = useThemeColors();

  const sessionsQuery = useQuery({
    queryKey: ['ai-sessions'],
    queryFn: aiService.getSessions,
    staleTime: 30_000,
  });

  const sessions = (sessionsQuery.data || []).slice(0, 5);

  return (
    <FlowScreen scroll={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <Text style={[TYPOGRAPHY.heading, { color: colors.text }]}>Flow</Text>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
          </View>
        </View>

        {/* Search Bar */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/flow/chat' as any)}
            style={{
              backgroundColor: colors.card,
              borderRadius: RADIUS.lg,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING.md,
            }}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, flex: 1 }]}>
              Ask Flow anything...
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Modes */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
          <Text style={[TYPOGRAPHY.label, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }]}>
            Quick Modes
          </Text>
        </View>
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl, flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
          {QUICK_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.key}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: mode.route as any, params: mode.params })}
              style={{
                width: '31%',
                backgroundColor: colors.card,
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: SPACING.md,
                alignItems: 'center',
                gap: SPACING.sm,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mode.bg + '15', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={mode.icon} size={20} color={mode.bg} />
              </View>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600', textAlign: 'center' }}>
                {mode.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Conversations */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
          <Text style={[TYPOGRAPHY.label, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }]}>
            Recent Conversations
          </Text>
        </View>
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {sessions.length > 0 ? (
            sessions.map((session: ChatSession) => (
              <FlowCard
                key={session.id}
                onPress={() => router.push({ pathname: '/(tabs)/flow/chat' as any, params: { sessionId: session.id } })}
                style={{ marginBottom: SPACING.sm }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: RADIUS.sm,
                      backgroundColor: colors.ai + '18',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="chatbubble" size={18} color={colors.ai} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[TYPOGRAPHY.body, { color: colors.text }]} numberOfLines={1}>
                      {session.title}
                    </Text>
                    {session.last_message && (
                      <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                        {session.last_message.content}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </View>
              </FlowCard>
            ))
          ) : (
            <FlowCard>
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                <Ionicons name="chatbubbles-outline" size={32} color={colors.textSecondary} />
                <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, marginTop: SPACING.md }]}>
                  No conversations yet
                </Text>
              </View>
            </FlowCard>
          )}
        </View>
      </ScrollView>
    </FlowScreen>
  );
}
