import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Skeleton } from '@/components/ui';
import { useRankings } from '@/hooks/useRankings';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

function BoardSection({ title, icon, data, colors, myUserId }: {
  title: string; icon: string; data: any[]; colors: any; myUserId?: number;
}) {
  const top3 = data.slice(0, 3);
  const rest = data.slice(3);
  const medalColors = ['#eab308', '#94a3b8', '#cd7c2f'];

  return (
    <View style={{ marginBottom: SPACING.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <Ionicons name={icon as any} size={18} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>{title}</Text>
      </View>

      {top3.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: SPACING.sm, marginBottom: SPACING.lg }}>
          {[1, 0, 2].map((idx) => {
            const entry = top3[idx];
            if (!entry) return <View key={idx} style={{ width: 100 }} />;
            const isMe = entry.is_me;
            return (
              <View key={idx} style={{ alignItems: 'center', width: idx === 0 ? 110 : 100 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isMe ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: medalColors[idx] || colors.border, marginBottom: 6 }}>
                  <Text style={{ color: isMe ? '#ffffff' : colors.text, fontSize: 14, fontWeight: '700' }}>{idx + 1}</Text>
                </View>
                <Text style={{ color: isMe ? colors.primary : colors.text, fontSize: 11, fontWeight: isMe ? '700' : '500', textAlign: 'center' }} numberOfLines={1}>{entry.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{entry.earned_xp.toLocaleString()} XP</Text>
              </View>
            );
          })}
        </View>
      )}

      {rest.map((entry, idx) => {
        const isMe = entry.is_me;
        return (
          <View key={entry.user_id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isMe ? colors.primary + '10' : colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xs, borderWidth: 1, borderColor: isMe ? colors.primary + '40' : colors.border }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, fontWeight: '600', width: 30, textAlign: 'center' }}>#{idx + 4}</Text>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginLeft: SPACING.sm, marginRight: SPACING.md }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{entry.initials || entry.name[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: isMe ? colors.primary : colors.text, fontSize: FONT_SIZE.sm, fontWeight: isMe ? '700' : '500' }} numberOfLines={1}>{entry.name}{isMe ? ' (You)' : ''}</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{entry.earned_xp.toLocaleString()}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function RankingsScreen() {
  const colors = useThemeColors();
  const rankingsQuery = useRankings();
  const [activeBoard, setActiveBoard] = useState<'earned' | 'total' | 'streak'>('earned');

  const boards = [
    { key: 'earned', label: 'XP Earned', icon: 'flash' },
    { key: 'total', label: 'Total XP', icon: 'trophy' },
    { key: 'streak', label: 'Streak', icon: 'flame' },
  ] as const;

  const data = rankingsQuery.data;
  const currentData = data?.[activeBoard];
  const board = currentData?.board || [];
  const myRank = currentData?.my_rank;

  return (
    <Screen safeArea={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={rankingsQuery.isRefetching} onRefresh={() => rankingsQuery.refetch()} tintColor={colors.primary} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Rankings</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: 3, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
            {boards.map((board) => (
              <TouchableOpacity key={board.key} onPress={() => setActiveBoard(board.key)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm, borderRadius: RADIUS.md - 2, backgroundColor: activeBoard === board.key ? colors.primary : 'transparent' }}>
                <Ionicons name={board.icon as any} size={12} color={activeBoard === board.key ? '#ffffff' : colors.textSecondary} />
                <Text style={{ color: activeBoard === board.key ? '#ffffff' : colors.textSecondary, fontSize: 11, fontWeight: '600' }}>{board.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {myRank && (
            <View style={{ backgroundColor: colors.primary + '15', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderColor: colors.primary + '40' }}>
              <Ionicons name="person" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '700' }}>Your Rank: #{myRank}</Text>
              </View>
            </View>
          )}

          {rankingsQuery.isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} height={48} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.xs }} />)
          ) : board.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="trophy-outline" size={48} color={colors.textSecondary} style={{ marginBottom: SPACING.md }} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>No rankings available yet</Text>
            </View>
          ) : (
            <BoardSection
              title={boards.find((b) => b.key === activeBoard)?.label || ''}
              icon={boards.find((b) => b.key === activeBoard)?.icon || ''}
              data={board}
              colors={colors}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
