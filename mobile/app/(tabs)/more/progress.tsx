import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function ProgressScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();

  const xpProgress = user ? Math.min(1, (user.xp ?? 0) / Math.max(1, user.level?.next_xp ?? 500)) : 0;
  const xpRemaining = user ? Math.max(0, (user.level?.next_xp ?? 500) - (user.xp ?? 0)) : 500;
  const levelNum = user?.level?.num ?? 1;

  const ranks = [
    { level: 1, name: 'Freshman', xp: '0', color: '#94a3b8' },
    { level: 5, name: 'Sophomore', xp: '2,500', color: '#06b6d4' },
    { level: 10, name: 'Junior', xp: '10,000', color: '#8b5cf6' },
    { level: 15, name: 'Senior', xp: '22,500', color: '#f97316' },
    { level: 20, name: 'Scholar', xp: '40,000', color: '#eab308' },
    { level: 25, name: 'Sage', xp: '62,500', color: '#22c55e' },
    { level: 30, name: 'Oracle', xp: '90,000', color: '#ef4444' },
  ];

  return (
    <Screen safeArea={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Progress</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {/* ═══ HERO — Level + XP ═══ */}
          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: SPACING.md }}>
              <Text style={{ color: colors.primary, fontSize: 64, fontWeight: '900', lineHeight: 68 }}>{levelNum}</Text>
              <View style={{ marginLeft: SPACING.md, marginBottom: 6 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700' }}>{user?.level?.rank || 'Freshman'}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{(user?.xp ?? 0).toLocaleString()} lifetime XP</Text>
              </View>
            </View>

            {/* XP progress bar */}
            <View style={{ height: 10, backgroundColor: colors.muted, borderRadius: 5, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${xpProgress * 100}%`, backgroundColor: colors.primary, borderRadius: 5 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Current</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{xpRemaining.toLocaleString()} XP to next level</Text>
            </View>
          </View>

          {/* ═══ KEY ACHIEVEMENTS — varied sizes ═══ */}
          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: SPACING.md }}>
            Achievements
          </Text>

          {/* Large achievements row */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
            {/* Streak — large */}
            <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: '#ef444420' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#ef444418', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flame" size={16} color="#ef4444" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>Streak</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900' }}>{user?.study_streak ?? 0}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>days</Text>
            </View>

            {/* XP — large */}
            <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: '#f9731620' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f9731618', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flash" size={16} color="#f97316" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>Total XP</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900' }}>{(user?.xp ?? 0).toLocaleString()}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>earned</Text>
            </View>
          </View>

          {/* Compact achievements row */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
            <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#06b6d418', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="time" size={13} color="#06b6d4" />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>{user?.total_study_time ?? 0}m</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Study time</Text>
              </View>
            </View>

            <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#22c55e18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flag" size={13} color="#22c55e" />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>{user?.weekly_goal_hours ?? 5}h</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Weekly goal</Text>
              </View>
            </View>
          </View>

          {/* ═══ RANK TIMELINE — visual journey ═══ */}
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>Rank Journey</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
            {ranks.map((rank, idx) => {
              const isCurrent = levelNum >= rank.level && (idx === ranks.length - 1 || levelNum < ranks[idx + 1].level);
              const isPassed = levelNum > rank.level;
              return (
                <View key={rank.level} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx < ranks.length - 1 ? 0 : 0 }}>
                  {/* Timeline connector */}
                  <View style={{ alignItems: 'center', width: 20 }}>
                    <View style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: isPassed ? rank.color : isCurrent ? rank.color + '40' : colors.muted,
                      borderWidth: isCurrent ? 2 : 0,
                      borderColor: rank.color,
                    }} />
                    {idx < ranks.length - 1 && (
                      <View style={{ width: 2, height: 24, backgroundColor: isPassed ? rank.color + '40' : colors.border }} />
                    )}
                  </View>

                  {/* Rank info */}
                  <View style={{ flex: 1, marginLeft: SPACING.sm, paddingVertical: SPACING.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                      <Text style={{
                        color: isCurrent ? rank.color : isPassed ? colors.text : colors.textSecondary,
                        fontSize: FONT_SIZE.sm,
                        fontWeight: isCurrent ? '700' : '500',
                      }}>
                        Lvl {rank.level}: {rank.name}
                      </Text>
                      {isPassed && <Ionicons name="checkmark-circle" size={12} color="#22c55e" />}
                      {isCurrent && <View style={{ backgroundColor: rank.color + '25', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: rank.color, fontSize: 9, fontWeight: '700' }}>YOU</Text></View>}
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{rank.xp} XP</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
