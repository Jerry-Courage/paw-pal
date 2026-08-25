import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import FlowScreen from '@/components/flow/FlowScreen';
import { useThemeColors } from '@/hooks/useTheme';
import { useAuth } from '@/lib/auth-context';
import { useProgression } from '@/hooks/useProgression';
import { useNextMove, useTodayTasks } from '@/hooks/useNextMove';
import { libraryService } from '@/services/library';
import { SPACING, RADIUS, FONT_SIZE, TYPOGRAPHY } from '@/constants/theme';
import { Resource } from '@/types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getResourceTitle(r: Resource): string {
  if (r.title && r.title.trim()) return r.title;
  if (r.url) {
    try {
      const u = new URL(r.url);
      const parts = u.pathname.split('/').filter(Boolean);
      return decodeURIComponent(parts[parts.length - 1] || r.resource_type.toUpperCase());
    } catch {}
  }
  return r.resource_type.toUpperCase();
}

const TYPE_ACCENTS: Record<string, { bg: string; icon: string; color: string }> = {
  pdf: { bg: '#ef444412', icon: 'document-text', color: '#ef4444' },
  video: { bg: '#8b5cf612', icon: 'play-circle', color: '#8b5cf6' },
  slides: { bg: '#f9731612', icon: 'easel', color: '#f97316' },
  code: { bg: '#22c55e12', icon: 'code-slash', color: '#22c55e' },
  other: { bg: '#94a3b812', icon: 'document', color: '#94a3b8' },
};

export default function HomeScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);
  const { data: progression, refetch: refetchProgression } = useProgression();
  const nextMove = useNextMove();
  const todayTasks = useTodayTasks();

  const resourcesQuery = useQuery({
    queryKey: ['library-resources'],
    queryFn: () => libraryService.getResources(),
    staleTime: 30_000,
  });

  const resources = resourcesQuery.data || [];
  const recentResources = resources.filter((r: Resource) => r.status === 'ready').slice(0, 8);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([resourcesQuery.refetch(), refetchProgression()]);
    setRefreshing(false);
  };

  const levelNum = progression?.level?.num ?? user?.level?.num ?? 1;
  const rankName = progression?.level?.rank || user?.level?.rank || '';
  const currentStreak = progression?.current_streak ?? user?.study_streak ?? 0;
  const flowcoins = progression?.flowcoins ?? 0;
  const xpInto = progression?.xp_into_level ?? 0;
  const xpRequired = progression?.xp_required_for_next_level;
  const xpProgress = xpRequired ? Math.min(1, xpInto / xpRequired) : 1;

  return (
    <FlowScreen scroll={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ═══ HEADER: Greeting + Identity Pill ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, fontWeight: '500' }}>
            {getGreeting()}
          </Text>
          <Text style={[TYPOGRAPHY.heading, { color: colors.text, marginTop: 2 }]}>
            {user?.first_name || 'there'}
          </Text>
        </View>

        {/* Identity Pill — unified progression element */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.card,
            borderRadius: RADIUS.pill,
            paddingVertical: 10,
            paddingLeft: 16,
            paddingRight: 8,
            gap: 4,
          }}>
            {/* Streak */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12, borderRightWidth: 1, borderRightColor: colors.border }}>
              <Text style={{ fontSize: 14 }}>🔥</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{currentStreak}</Text>
            </View>
            {/* Level */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: colors.border }}>
              <Ionicons name="shield" size={14} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Lv.{levelNum}</Text>
            </View>
            {/* FlowCoins */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, flex: 1 }}>
              <Ionicons name="diamond" size={13} color={colors.flowCoin} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{flowcoins}</Text>
            </View>
            {/* XP ring — mini progress */}
            {xpRequired != null && (
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 2.5,
                borderColor: colors.primary,
                borderRightColor: xpProgress > 0.75 ? colors.primary : 'transparent',
                borderBottomColor: xpProgress > 0.5 ? colors.primary : 'transparent',
                borderLeftColor: xpProgress > 0.25 ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.background,
              }}>
                <Text style={{ color: colors.primary, fontSize: 8, fontWeight: '800' }}>{Math.round(xpProgress * 100)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ═══ NEXT MOVE: The Launchpad ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.xl }}>
          {nextMove ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(nextMove.destination as any)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: RADIUS.xl,
                padding: SPACING.xl,
                paddingBottom: 20,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 16,
                elevation: 12,
              }}
            >
              {/* Top row: label + icon */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  Your Next Move
                </Text>
                <Ionicons name={nextMove.icon as any} size={20} color="rgba(255,255,255,0.8)" />
              </View>

              {/* Title */}
              <Text style={{ color: '#fff', fontSize: FONT_SIZE.xl, fontWeight: '800', lineHeight: 26, marginBottom: 4 }} numberOfLines={2}>
                {nextMove.title}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FONT_SIZE.sm, marginBottom: SPACING.md }} numberOfLines={1}>
                {nextMove.subtitle}
              </Text>

              {/* Progress bar — white on orange */}
              {nextMove.progress != null && (
                <View style={{ marginBottom: SPACING.md }}>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${nextMove.progress}%`, backgroundColor: '#fff', borderRadius: 2 }} />
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 4 }}>{nextMove.progress}% complete</Text>
                </View>
              )}

              {/* CTA */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '700' }}>{nextMove.reason}</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/library' as any)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: RADIUS.xl,
                padding: SPACING.xl,
                alignItems: 'center',
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 16,
                elevation: 12,
              }}
            >
              <Ionicons name="rocket" size={32} color="#fff" style={{ marginBottom: SPACING.md }} />
              <Text style={{ color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: 4 }}>
                Start Learning
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FONT_SIZE.sm }}>
                Upload study material to begin
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ TODAY: Urgency-coded ═══ */}
        {todayTasks.length > 0 && (
          <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.xl }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: SPACING.sm }}>
              Today
            </Text>
            {todayTasks.map((item) => {
              const urgencyMap: Record<string, { accent: string; bg: string }> = {
                review: { accent: '#eab308', bg: '#eab30808' },
                study: { accent: '#22c55e', bg: '#22c55e08' },
                assignment: { accent: '#8b5cf6', bg: '#8b5cf608' },
                session: { accent: '#f97316', bg: '#f9731608' },
              };
              const u = urgencyMap[item.type] || urgencyMap.study;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => router.push(item.destination as any)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: u.bg,
                    borderRadius: RADIUS.md,
                    paddingVertical: 12,
                    paddingLeft: 12,
                    paddingRight: 14,
                    marginBottom: 6,
                    gap: 10,
                  }}
                >
                  {/* Left accent strip */}
                  <View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: u.accent }} />
                  <Text style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '500' }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: u.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                    {item.type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ═══ CONTINUE LEARNING: Color-coded shelf ═══ */}
        {recentResources.length > 0 && (
          <View style={{ marginTop: SPACING.xl }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: SPACING.sm, paddingHorizontal: SPACING.lg }}>
              Continue Learning
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: SPACING.lg, paddingRight: SPACING.md, gap: 10 }}
            >
              {recentResources.map((r: Resource) => {
                const title = getResourceTitle(r);
                const accent = TYPE_ACCENTS[r.resource_type] || TYPE_ACCENTS.other;
                return (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/(tabs)/learn/${r.id}` as any)}
                    style={{
                      width: 150,
                      backgroundColor: colors.card,
                      borderRadius: RADIUS.lg,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Color strip top */}
                    <View style={{ height: 4, backgroundColor: accent.color }} />
                    <View style={{ padding: SPACING.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: accent.bg, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={accent.icon as any} size={11} color={accent.color} />
                        </View>
                        <Text style={{ color: accent.color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                          {r.resource_type}
                        </Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', lineHeight: 16 }} numberOfLines={2}>
                        {title}
                      </Text>
                      {r.subject ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 4 }} numberOfLines={1}>
                          {r.subject}
                        </Text>
                      ) : null}
                      {r.has_study_kit && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#22c55e' }} />
                          <Text style={{ color: '#22c55e', fontSize: 9, fontWeight: '600' }}>Ready</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ═══ QUIZ BATTLE: Energetic pill ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.xl }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/more/battle' as any)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#ef44440D',
              borderRadius: RADIUS.pill,
              paddingVertical: 12,
              paddingLeft: 14,
              paddingRight: 16,
              gap: 10,
            }}
          >
            <View style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#ef444418',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="flash" size={16} color="#ef4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Quiz Battle</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Challenge someone</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </FlowScreen>
  );
}
