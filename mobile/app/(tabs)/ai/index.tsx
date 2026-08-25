import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton, EmptyState } from '@/components/ui';
import { useConversations } from '@/hooks/useConversations';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { ChatSession } from '@/types';

const SUGGESTED_ACTIONS = [
  { key: 'explain', icon: 'bulb', label: 'Explain a concept', color: '#f97316' },
  { key: 'quiz', icon: 'help-circle', label: 'Quiz me', color: '#8b5cf6' },
  { key: 'assignment', icon: 'document-text', label: 'Help with an assignment', color: '#22c55e' },
  { key: 'math', icon: 'calculator', label: 'Solve a math problem', color: '#06b6d4' },
  { key: 'exam', icon: 'school', label: 'Prepare for an exam', color: '#ec4899' },
];

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function AiLandingScreen() {
  const colors = useThemeColors();
  const conversationsQuery = useConversations();
  const [refreshing, setRefreshing] = useState(false);

  const conversations = conversationsQuery.data || [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await conversationsQuery.refetch();
    setRefreshing(false);
  }, []);

  const handleNewChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/ai/chat' as any);
  }, []);

  const handleSuggestedAction = useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === 'math') {
      router.push('/(tabs)/ai/math-solver' as any);
    } else if (key === 'exam') {
      router.push('/(tabs)/ai/exam-prep' as any);
    } else {
      router.push({ pathname: '/(tabs)/ai/chat' as any, params: { prompt: key } });
    }
  }, []);

  const handleOpenConversation = useCallback((session: ChatSession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/ai/chat' as any, params: { sessionId: session.id } });
  }, []);

  const renderConversation = useCallback(({ item }: { item: ChatSession }) => (
    <TouchableOpacity
      onPress={() => handleOpenConversation(item)}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: colors.border,
        gap: SPACING.md,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="chatbubble" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>
          {item.title || 'New Conversation'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }} numberOfLines={1}>
          {item.last_message?.content?.slice(0, 60) || 'No messages yet'}
        </Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
        {timeAgo(item.updated_at)}
      </Text>
    </TouchableOpacity>
  ), [colors, handleOpenConversation]);

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderConversation}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl }}>
              <View>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800' }}>
                  Flow AI
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginTop: 2 }}>
                  Your study assistant
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleNewChat}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="add" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Suggested Actions */}
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>
              What can I help with?
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              {SUGGESTED_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  onPress={() => handleSuggestedAction(action.key)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: action.color + '12',
                    borderRadius: RADIUS.full,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.sm,
                    borderWidth: 1,
                    borderColor: action.color + '25',
                    gap: SPACING.xs,
                  }}
                >
                  <Ionicons name={action.icon as any} size={14} color={action.color} />
                  <Text style={{ color: action.color, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Conversations */}
            {conversations.length > 0 && (
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>
                Recent
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          conversationsQuery.isLoading ? (
            <View style={{ paddingHorizontal: SPACING.lg }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.md }}>
                  <Skeleton width={40} height={40} borderRadius={20} />
                  <View style={{ flex: 1 }}>
                    <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
                    <Skeleton width="40%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ paddingHorizontal: SPACING.lg }}>
              <EmptyState
                icon="💬"
                title="Start a conversation"
                description="Ask me anything about your studies"
              />
            </View>
          )
        }
      />
    </Screen>
  );
}
