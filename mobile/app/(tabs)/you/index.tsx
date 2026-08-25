import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/useTheme';
import { useProgression } from '@/hooks/useProgression';
import { SPACING, FONT_SIZE, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatStudyTime(hours: number): string {
  if (hours < 0.01) return '0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const NAV_ITEMS = [
  { icon: 'stats-chart', label: 'Progress', desc: 'XP, level & study stats', color: '#22c55e', route: '/(tabs)/more/progress' },
  { icon: 'trophy', label: 'Rankings', desc: 'See how you rank', color: '#eab308', route: '/(tabs)/more/rankings' },
  { icon: 'diamond', label: 'Subscription', desc: 'Manage your plan', color: '#f97316', route: '/(tabs)/more/subscription' },
] as const;

export default function YouScreen() {
  const { user, logout } = useAuth();
  const colors = useThemeColors();
  const { data: progression } = useProgression();

  const xpProgress = progression
    ? (progression.xp_required_for_next_level
        ? progression.xp_into_level / progression.xp_required_for_next_level
        : 1)
    : (user ? Math.min(1, (user.xp ?? 0) / Math.max(1, user.level?.next_xp ?? 500)) : 0);
  const levelNum = progression?.level?.num ?? user?.level?.num ?? 1;
  const xpRemaining = progression?.xp_required_for_next_level ?? (user ? Math.max(0, (user.level?.next_xp ?? 500) - (user.xp ?? 0)) : 500);
  const lifetimeXp = progression?.lifetime_xp ?? user?.xp ?? 0;
  const currentStreak = progression?.current_streak ?? user?.study_streak ?? 0;
  const flowcoins = progression?.flowcoins ?? 0;

  const initials = user
    ? ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || user.username?.[0]?.toUpperCase() || '?'
    : '?';

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Guest';

  const levelName = progression?.level?.rank || user?.level?.rank || '';

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ═══ IDENTITY HEADER — banner area ═══ */}
        <View style={{
          backgroundColor: colors.primary + '0A',
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.xl,
          paddingBottom: SPACING.xxl,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={[TYPOGRAPHY.heading, { color: colors.text }]}>You</Text>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/you/settings' as any); }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="settings-outline" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Avatar + name — large, personal */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginTop: SPACING.xl }}>
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}>
              {user?.avatar_url ? (
                <View />
              ) : (
                <Text style={{ color: '#ffffff', fontSize: 26, fontWeight: '700' }}>{initials}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '700' }}>{displayName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginTop: 2 }}>{user?.email || ''}</Text>
            </View>
          </View>
        </View>

        {/* ═══ LEVEL EMBLEM — not a card, a visual identity element ═══ */}
        <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
          <View style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 3,
            borderColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary + '0A',
          }}>
            <Text style={{ color: colors.primary, fontSize: 32, fontWeight: '800' }}>{levelNum}</Text>
          </View>
          {levelName ? (
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginTop: 8 }}>{levelName}</Text>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 4 }}>
            {lifetimeXp} lifetime XP · {xpRemaining} to next
          </Text>
        </View>

        {/* ═══ STATS — varied sizes, not equal cards ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Streak — large */}
            <View style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: RADIUS.lg,
              padding: SPACING.lg,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 24, marginBottom: 4 }}>🔥</Text>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{currentStreak}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>Streak</Text>
            </View>
            {/* FlowCoins — large */}
            <View style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: RADIUS.lg,
              padding: SPACING.lg,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
            }}>
              <Ionicons name="diamond" size={22} color={colors.flowCoin} />
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>{flowcoins}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>FlowCoins</Text>
            </View>
          </View>
          {/* Secondary stats — compact row */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: RADIUS.md,
              padding: SPACING.md,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Ionicons name="library" size={14} color="#8b5cf6" />
              <View>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{user?.notes_used ?? 0}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Resources</Text>
              </View>
            </View>
            <View style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: RADIUS.md,
              padding: SPACING.md,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Ionicons name="time" size={14} color="#06b6d4" />
              <View>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{formatStudyTime(user?.total_study_time ?? 0)}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Study Time</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ═══ NAVIGATION — color-coded, not settings rows ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
          {NAV_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(item.route as any);
              }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: SPACING.lg,
                marginBottom: 8,
                gap: SPACING.md,
              }}
            >
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: item.color + '15',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>{item.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 1 }}>{item.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══ SIGN OUT — minimal ═══ */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.7}
            style={{ paddingVertical: SPACING.md, alignItems: 'center' }}
          >
            <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.sm, fontWeight: '500' }}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>FlowState v2.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
