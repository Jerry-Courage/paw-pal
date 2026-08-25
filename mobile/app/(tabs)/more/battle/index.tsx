import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Skeleton, Button } from '@/components/ui';
import { useBattleHistory } from '@/hooks/useQuizBattle';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function BattleIndexScreen() {
  const colors = useThemeColors();
  const historyQuery = useBattleHistory();
  const [refreshing, setRefreshing] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinPin, setJoinPin] = useState('');

  const history = historyQuery.data || [];

  const onRefresh = async () => {
    setRefreshing(true);
    await historyQuery.refetch();
    setRefreshing(false);
  };

  const handleJoin = () => {
    if (!joinPin.trim()) return;
    router.push({ pathname: '/(tabs)/more/battle/[pin]', params: { pin: joinPin.trim(), action: 'join' } });
    setJoinPin('');
    setShowJoin(false);
  };

  return (
    <Screen safeArea={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Quiz Battle</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Compete in real-time quizzes</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
            <TouchableOpacity onPress={() => router.push('/(tabs)/more/battle/create' as any)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: '#ef4444', borderRadius: RADIUS.lg, padding: SPACING.md }}>
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Create Battle</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowJoin(!showJoin)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="enter-outline" size={16} color="#ef4444" />
              <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Join Battle</Text>
            </TouchableOpacity>
          </View>

          {/* Join Form */}
          {showJoin && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.md }}>Enter Battle PIN</Text>
              <TextInput value={joinPin} onChangeText={setJoinPin} placeholder="6-digit PIN" placeholderTextColor={colors.textSecondary} keyboardType="numeric" maxLength={6} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '600', letterSpacing: 4, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.md, textAlign: 'center' }} />
              <Button title="Join Battle" variant="primary" onPress={handleJoin} disabled={!joinPin.trim()} />
            </View>
          )}

          {/* Battle History */}
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.md }}>Recent Battles</Text>
          {historyQuery.isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} height={56} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.sm }} />)
          ) : history.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="game-controller-outline" size={48} color={colors.textSecondary} style={{ marginBottom: SPACING.md }} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 4 }}>No battles yet</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>Create or join a battle to get started</Text>
            </View>
          ) : (
            history.map((h) => (
              <View key={h.id} style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: h.rank <= 3 ? '#eab308' + '40' : colors.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: h.rank <= 3 ? '#eab308' + '18' : colors.background, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: h.rank <= 3 ? '#eab308' : colors.textSecondary, fontSize: 14, fontWeight: '700' }}>#{h.rank}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{h.correct_count}/{h.total_questions} correct</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{h.score} pts · {h.xp_earned} XP · Best streak: {h.best_streak}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{new Date(h.created_at).toLocaleDateString()}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
