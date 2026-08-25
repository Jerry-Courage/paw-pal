import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, ProgressBar, Skeleton, Button } from '@/components/ui';
import { useResource, useResourceProgress } from '@/hooks/useResources';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

function getTypeIcon(type: string): string {
  switch (type) {
    case 'pdf': return 'document-text';
    case 'video': return 'play-circle';
    case 'slides': return 'easel';
    case 'code': return 'code-slash';
    default: return 'document';
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'pdf': return '#ef4444';
    case 'video': return '#8b5cf6';
    case 'slides': return '#f97316';
    case 'code': return '#22c55e';
    default: return '#94a3b8';
  }
}


export default function ResourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const resourceQuery = useResource(resourceId);
  const progressQuery = useResourceProgress(resourceId);

  const resource = resourceQuery.data;
  const progress = progressQuery.data;

  if (resourceQuery.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.lg }} />
          <Skeleton width="80%" height={24} style={{ marginBottom: SPACING.sm }} />
          <Skeleton width="50%" height={14} style={{ marginBottom: SPACING.xl }} />
          <Skeleton height={120} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.xl }} />
          <Skeleton height={14} style={{ marginBottom: SPACING.md }} />
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
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.xl }}>
            This resource may have been deleted or you don't have access.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: colors.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full }}>
            <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.sm, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── BACK BUTTON ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginLeft: SPACING.md }} numberOfLines={1}>
            Library
          </Text>
          <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── RESOURCE INFO ── */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.lg }}>
            <View style={{ width: 56, height: 56, borderRadius: RADIUS.lg, backgroundColor: getTypeColor(resource.resource_type) + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={getTypeIcon(resource.resource_type) as any} size={28} color={getTypeColor(resource.resource_type)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }} numberOfLines={2}>
                {resource.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {resource.resource_type.toUpperCase()}
                </Text>
                {resource.subject && (
                  <>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>·</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>{resource.subject}</Text>
                  </>
                )}
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>·</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {new Date(resource.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>

          {/* ── STATUS ── */}
          {resource.status === 'processing' && (
            <View style={{ backgroundColor: colors.warning + '15', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.warning + '30' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <Ionicons name="sync" size={16} color={colors.warning} />
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Processing...</Text>
                <Text style={{ color: colors.warning, fontSize: FONT_SIZE.xs, fontWeight: '700', marginLeft: 'auto' }}>
                  {resource.processing_progress}%
                </Text>
              </View>
              <ProgressBar progress={resource.processing_progress} height={6} color={colors.warning} />
              {resource.status_text ? (
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: SPACING.sm }}>
                  {resource.status_text}
                </Text>
              ) : null}
            </View>
          )}

          {resource.status === 'error' && (
            <View style={{ backgroundColor: colors.error + '15', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.error + '30' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Processing failed</Text>
              </View>
            </View>
          )}

          {/* ── PROGRESS ── */}
          {progress && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Mastery</Text>
                <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '700' }}>
                  {progress.mastery}%
                </Text>
              </View>
              <ProgressBar progress={progress.mastery} height={8} />
              <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {progress.completed_count}/{progress.step_order.length} steps
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {progress.xp_earned} XP earned
                </Text>
              </View>
            </View>
          )}

          {/* ── SUMMARY ── */}
          {resource.ai_summary ? (
            <View style={{ marginBottom: SPACING.lg }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.sm }}>Summary</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, lineHeight: 22 }}>
                {resource.ai_summary}
              </Text>
            </View>
          ) : null}

          {/* ── CONCEPTS ── */}
          {resource.ai_concepts && resource.ai_concepts.length > 0 && (
            <View style={{ marginBottom: SPACING.lg }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.sm }}>
                Key Concepts ({resource.ai_concepts.length})
              </Text>
              {resource.ai_concepts.slice(0, 5).map((concept, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm }} numberOfLines={1}>
                    {concept.title}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── STUDY FEATURES ── */}
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>
            Study Tools
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/(tabs)/library/${resourceId}/study` as any);
            }}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.primary + '15',
              borderRadius: RADIUS.lg,
              padding: SPACING.lg,
              borderWidth: 1,
              borderColor: colors.primary + '30',
              gap: SPACING.md,
            }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="school" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Start Studying</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                Notes, Flashcards, Quiz
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>

          {/* AI Quick Actions */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/(tabs)/ai/chat' as any, params: { resourceId: resourceId } });
              }}
              activeOpacity={0.7}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: colors.card, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Ask Flow AI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/(tabs)/library/podcast' as any, params: { resourceId: resourceId, resourceTitle: resource?.title } });
              }}
              activeOpacity={0.7}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: colors.card, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="headset" size={14} color="#8b5cf6" />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Podcast</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
