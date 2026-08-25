import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Avatar, StatCard, ProgressBar, SectionHeader, Skeleton, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useResources } from '@/hooks/useResources';
import { useDashboard } from '@/hooks/useDashboard';
import { useLearningPaths } from '@/hooks/useLearningPaths';
import { usePlannerSessions, useDeadlines } from '@/hooks/usePlanner';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { Resource } from '@/types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getMasteryColor(mastery: number): string {
  if (mastery >= 80) return '#22c55e';
  if (mastery >= 40) return '#eab308';
  return '#94a3b8';
}

function getMasteryLabel(mastery: number): string {
  if (mastery >= 80) return 'Mastered';
  if (mastery >= 40) return 'Learning';
  return 'New';
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'pdf': return 'document-text';
    case 'video': return 'play-circle';
    case 'slides': return 'easel';
    case 'code': return 'code-slash';
    default: return 'document';
  }
}

export default function HomeScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const resourcesQuery = useResources();
  const { analytics, nudge } = useDashboard();
  const learningPathsQuery = useLearningPaths();
  const sessionsQuery = usePlannerSessions();
  const deadlinesQuery = useDeadlines();
  const [refreshing, setRefreshing] = React.useState(false);

  const resources = Array.isArray(resourcesQuery.data) ? resourcesQuery.data : [];
  const recentResources = resources.slice(0, 4);
  const processingCount = resources.filter((r) => r.status === 'processing').length;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      resourcesQuery.refetch(),
      analytics.refetch(),
      nudge.refetch(),
      learningPathsQuery.refetch(),
      sessionsQuery.refetch(),
      deadlinesQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const isLoading = resourcesQuery.isLoading;

  if (isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg }}>
          <Skeleton width={160} height={28} style={{ marginBottom: SPACING.sm }} />
          <Skeleton width={100} height={14} style={{ marginBottom: SPACING.xxl }} />
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
            <Skeleton width="48%" height={90} borderRadius={RADIUS.lg} />
            <Skeleton width="48%" height={90} borderRadius={RADIUS.lg} />
          </View>
          <Skeleton height={14} style={{ marginBottom: SPACING.md }} />
          <Skeleton height={56} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.lg }} />
          <Skeleton height={14} style={{ marginBottom: SPACING.md }} />
          <Skeleton height={100} borderRadius={RADIUS.lg} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── HEADER ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SPACING.lg, paddingHorizontal: SPACING.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>
              {getGreeting()} 👋
            </Text>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800', marginTop: 2 }}>
              {user?.first_name || user?.username || 'Student'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <View style={{ alignItems: 'flex-end', marginRight: SPACING.xs }}>
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '700' }}>
                {user?.level?.rank || 'Level 1'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                {user?.xp ?? 0} XP
              </Text>
            </View>
            <Avatar uri={user?.avatar_url} name={user?.username} size={42} />
          </View>
        </View>

        {/* ── AI NUDGE ── */}
        {nudge.data?.nudge && (
          <View style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.md }}>
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, lineHeight: 18 }}>
                {nudge.data.nudge}
              </Text>
            </View>
          </View>
        )}

        {/* ── STATS ROW ── */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.lg }}>
          <StatCard icon="🔥" label="Study Streak" value={`${user?.study_streak ?? 0}d`} color="#f97316" />
          <StatCard icon="⚡" label="Total XP" value={`${user?.xp ?? 0}`} color="#8b5cf6" />
        </View>

        <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.sm }}>
          <StatCard icon="📚" label="Resources" value={resources.length} color="#06b6d4" />
          <StatCard icon="⏱️" label="Study Time" value={`${Math.round(user?.total_study_time ?? 0)}h`} color="#22c55e" />
        </View>

        {/* ── WEEKLY GOAL ── */}
        {analytics.data && (
          <View style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.lg }}>
            <SectionHeader title="Weekly Goal" />
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>
                  {analytics.data.week_hours.toFixed(1)}h / {analytics.data.goal_hours}h
                </Text>
                <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '700' }}>
                  {Math.min(100, Math.round((analytics.data.week_hours / Math.max(analytics.data.goal_hours, 1)) * 100))}%
                </Text>
              </View>
              <ProgressBar
                progress={Math.min(100, (analytics.data.week_hours / Math.max(analytics.data.goal_hours, 1)) * 100)}
                height={8}
              />
            </View>
          </View>
        )}

        {/* ── CONTINUE LEARNING ── */}
        {learningPathsQuery.data && learningPathsQuery.data.length > 0 && (
          <View style={{ marginTop: SPACING.xl, paddingHorizontal: SPACING.lg }}>
            <SectionHeader title="Continue Learning" action="View All" onAction={() => router.push('/(tabs)/learn')} />
            {learningPathsQuery.data.slice(0, 3).map((path) => (
              <TouchableOpacity
                key={path.id}
                onPress={() => router.push(`/(tabs)/learn/${path.id}` as any)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, gap: SPACING.md, marginBottom: SPACING.sm }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="git-network" size={20} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{path.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>{path.concepts_completed}/{path.total_concepts} concepts · {path.mastery_percent}%</Text>
                  <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${path.mastery_percent}%`, backgroundColor: '#8b5cf6', borderRadius: 2 }} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── TODAY'S PLAN ── */}
        {sessionsQuery.data && sessionsQuery.data.filter((s) => new Date(s.start_time).toDateString() === new Date().toDateString() && s.status !== 'completed').length > 0 && (
          <View style={{ marginTop: SPACING.xl, paddingHorizontal: SPACING.lg }}>
            <SectionHeader title="Today's Plan" action="Planner" onAction={() => router.push('/(tabs)/more/planner')} />
            {sessionsQuery.data.filter((s) => new Date(s.start_time).toDateString() === new Date().toDateString() && s.status !== 'completed').slice(0, 3).map((s) => {
              const time = new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, gap: SPACING.md, marginBottom: SPACING.sm }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f97316' + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '700' }}>{time}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{s.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>{s.duration_minutes}min · {s.subject || 'General'}</Text>
                  </View>
                  {s.is_ai_suggested && <Ionicons name="sparkles" size={12} color={colors.primary} />}
                </View>
              );
            })}
          </View>
        )}

        {/* ── NEXT DEADLINE ── */}
        {deadlinesQuery.data && deadlinesQuery.data.length > 0 && (
          <View style={{ marginTop: SPACING.xl, paddingHorizontal: SPACING.lg }}>
            <SectionHeader title="Upcoming Deadline" />
            {deadlinesQuery.data.slice(0, 1).map((d) => {
              const dueColor = d.days_until <= 3 ? '#ef4444' : d.days_until <= 7 ? '#eab308' : '#22c55e';
              return (
                <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: dueColor + '30', gap: SPACING.md }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: dueColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: dueColor, fontSize: 14, fontWeight: '800' }}>{d.days_until}d</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{d.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>{d.subject || 'No subject'} · Due {new Date(d.due_date).toLocaleDateString()}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── QUICK ACTIONS ── */}
        <View style={{ marginTop: SPACING.lg, paddingHorizontal: SPACING.lg }}>
          <SectionHeader title="Quick Actions" />
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            {[
              { icon: 'cloud-upload', label: 'Upload', color: '#f97316', route: '/(tabs)/library' as const },
              { icon: 'chatbubble-ellipses', label: 'Ask AI', color: '#8b5cf6', route: '/(tabs)/ai' as const },
              { icon: 'book', label: 'Study', color: '#06b6d4', route: '/(tabs)/library' as const },
              { icon: 'trophy', label: 'Quiz', color: '#22c55e', route: '/(tabs)/library' as const },
            ].map((action) => (
              <TouchableOpacity
                key={action.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(action.route);
                }}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  backgroundColor: colors.card,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: action.color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm }}>
                  <Ionicons name={action.icon as any} size={20} color={action.color} />
                </View>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── CONTINUE STUDYING / RECENT RESOURCES ── */}
        <View style={{ marginTop: SPACING.xl, paddingHorizontal: SPACING.lg }}>
          <SectionHeader
            title="Recent Materials"
            action="View All"
            onAction={() => router.push('/(tabs)/library')}
          />

          {recentResources.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xxl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 36, marginBottom: SPACING.md }}>📚</Text>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: SPACING.xs }}>
                No materials yet
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.lg }}>
                Upload your first study material to get started
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/library')}
                style={{ backgroundColor: colors.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full }}
              >
                <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.sm, fontWeight: '700' }}>Upload Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: SPACING.sm }}>
              {recentResources.map((resource) => (
                <TouchableOpacity
                  key={resource.id}
                  onPress={() => router.push(`/(tabs)/library/${resource.id}` as any)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.card,
                    borderRadius: RADIUS.lg,
                    padding: SPACING.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: SPACING.md,
                  }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: '#f97316' + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={getTypeIcon(resource.resource_type) as any} size={20} color="#f97316" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>
                      {resource.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
                      {resource.resource_type.toUpperCase()} · {resource.subject || 'No subject'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {resource.status === 'processing' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="sync" size={12} color={colors.warning} />
                        <Text style={{ color: colors.warning, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                          {resource.processing_progress}%
                        </Text>
                      </View>
                    ) : resource.status === 'error' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="alert-circle" size={12} color={colors.error} />
                        <Text style={{ color: colors.error, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Failed</Text>
                      </View>
                    ) : (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: getMasteryColor(0) + '20' }}>
                        <Text style={{ color: getMasteryColor(0), fontSize: 10, fontWeight: '700' }}>
                          {getMasteryLabel(0)}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── PROCESSING BANNER ── */}
        {processingCount > 0 && (
          <View style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.lg }}>
            <View style={{ backgroundColor: colors.warning + '15', borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: colors.warning + '30' }}>
              <Ionicons name="sync" size={16} color={colors.warning} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm }}>
                {processingCount} resource{processingCount > 1 ? 's' : ''} processing...
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
