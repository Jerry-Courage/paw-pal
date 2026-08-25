import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton } from '@/components/ui';
import { useBattleSocket, BattleWsEvent } from '@/hooks/useBattleSocket';
import { useBattleSnapshot } from '@/hooks/useQuizBattle';
import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { QuizPlayer, LeaderboardEntry } from '@/types';

function PlayerCard({ player, isHost, isMe, colors }: { player: QuizPlayer; isHost: boolean; isMe: boolean; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isMe ? colors.primary + '10' : colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: isMe ? colors.primary + '40' : colors.border }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>{player.username[0].toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: SPACING.sm }}>
        <Text style={{ color: isMe ? colors.primary : colors.text, fontSize: FONT_SIZE.sm, fontWeight: isMe ? '700' : '500' }}>{player.username}{isMe ? ' (You)' : ''}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{player.score} pts · {player.streak} streak</Text>
      </View>
      {isHost && <Ionicons name="star" size={14} color="#eab308" />}
      {player.ready && <Ionicons name="checkmark-circle" size={14} color="#22c55e" style={{ marginLeft: SPACING.xs }} />}
    </View>
  );
}

function CountdownOverlay({ count, colors }: { count: number; colors: any }) {
  const labels: Record<number, string> = { 3: '3', 2: '2', 1: '1', 0: 'FLOW!' };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <Text style={{ color: count === 0 ? '#ef4444' : '#ffffff', fontSize: count === 0 ? 64 : 96, fontWeight: '900' }}>{labels[count] || ''}</Text>
    </View>
  );
}

function QuestionView({ question, qIdx, total, timeLeft, selectedAnswer, onSelect, colors }: {
  question: any; qIdx: number; total: number; timeLeft: number; selectedAnswer: string | null; onSelect: (c: string) => void; colors: any;
}) {
  const opts = ['opt_a', 'opt_b', 'opt_c', 'opt_d'];
  const labels = ['A', 'B', 'C', 'D'];
  const timeColor = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#eab308' : colors.text;

  return (
    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
      {/* Timer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
        <Ionicons name="time" size={16} color={timeColor} />
        <Text style={{ color: timeColor, fontSize: FONT_SIZE.lg, fontWeight: '800', marginLeft: SPACING.xs }}>{timeLeft}s</Text>
      </View>

      {/* Progress */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg }}>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Question {qIdx + 1} of {total}</Text>
      </View>
      <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: SPACING.lg, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${((qIdx + 1) / total) * 100}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
      </View>

      {/* Question */}
      <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', lineHeight: 24, marginBottom: SPACING.lg }}>{question.text}</Text>

      {/* Options */}
      {opts.map((opt, i) => {
        const selected = selectedAnswer === labels[i];
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => !selectedAnswer && onSelect(labels[i])}
            disabled={!!selectedAnswer}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: selected ? colors.primary + '20' : colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border, gap: SPACING.md }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: selected ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: selected ? '#ffffff' : colors.text, fontSize: 12, fontWeight: '700' }}>{labels[i]}</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, flex: 1 }}>{(question as any)[opt]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LeaderboardView({ leaderboard, colors }: { leaderboard: LeaderboardEntry[]; colors: any }) {
  return (
    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
      <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', textAlign: 'center', marginBottom: SPACING.md }}>Leaderboard</Text>
      {leaderboard.map((entry, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: entry.rank <= 3 ? '#eab308' + '10' : colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: entry.rank <= 3 ? '#eab308' + '30' : colors.border }}>
          <Text style={{ color: entry.rank <= 3 ? '#eab308' : colors.textSecondary, fontSize: 14, fontWeight: '700', width: 30, textAlign: 'center' }}>#{entry.rank}</Text>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', flex: 1 }}>{entry.username}</Text>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{entry.score.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

export default function BattleScreen() {
  const { pin, action } = useLocalSearchParams<{ pin: string; action?: string }>();
  const colors = useThemeColors();
  const { user } = useAuth();
  const snapshotQuery = useBattleSnapshot(pin || null);
  const [roomState, setRoomState] = useState<any>(null);
  const [players, setPlayers] = useState<QuizPlayer[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [qIdx, setQIdx] = useState(0);
  const [totalQ, setTotalQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [finalResults, setFinalResults] = useState<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { status: wsStatus, send, subscribe } = useBattleSocket(pin || null);

  // Auto-navigate back to lobby after game over (matches web behavior)
  useEffect(() => {
    if (gameOver && finalResults) {
      const timer = setTimeout(() => {
        router.replace('/(tabs)/more/battle');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameOver, finalResults]);

  // Handle join action
  useEffect(() => {
    if (action === 'join' && pin) {
      const { useJoinBattle } = require('@/hooks/useQuizBattle');
      // Already handled by navigation params
    }
  }, [action, pin]);

  // Initialize from snapshot
  useEffect(() => {
    if (snapshotQuery.data) {
      const snap = snapshotQuery.data;
      setRoomState(snap.room);
      setPlayers(snap.players);
      setTotalQ(snap.questions?.length || 0);
      if (snap.room.status === 'question') {
        const q = snap.questions?.find((q: any) => q.order === snap.room.current_q_idx);
        if (q) {
          setCurrentQuestion(q);
          setQIdx(snap.room.current_q_idx);
        }
      }
      if (snap.room.status === 'finished') {
        setGameOver(true);
      }
    }
  }, [snapshotQuery.data]);

  // WebSocket events
  useEffect(() => {
    const unsub = subscribe((event: BattleWsEvent) => {
      switch (event.type) {
        case 'player_joined':
        case 'player_left':
        case 'player_ready':
          setPlayers(event.players);
          if (event.type === 'player_joined') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'game_countdown':
          setRoomState((prev: any) => ({ ...prev, status: 'countdown' }));
          setCountdown(event.count);
          if (event.count > 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          if (event.count === 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'show_question':
          setRoomState((prev: any) => ({ ...prev, status: 'question' }));
          setCountdown(null);
          setCurrentQuestion(event);
          setQIdx(event.idx);
          setTotalQ(event.total);
          setTimeLeft(event.time_limit);
          setSelectedAnswer(null);
          setShowResult(false);
          setRoundResult(null);
          break;
        case 'timer_tick':
          setTimeLeft(event.remaining);
          break;
        case 'round_result':
          setRoomState((prev: any) => ({ ...prev, status: 'result' }));
          setShowResult(true);
          setRoundResult(event);
          setLeaderboard(event.leaderboard);
          if (event.leaderboard) setPlayers((prev) => prev.map((p) => { const lb = event.leaderboard.find((l: any) => l.username === p.username); return lb ? { ...p, score: lb.score, correct_count: lb.correct_count, streak: lb.streak } : p; }));
          break;
        case 'game_over':
          setRoomState((prev: any) => ({ ...prev, status: 'finished' }));
          setGameOver(true);
          setFinalResults(event);
          setLeaderboard(event.leaderboard);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'error':
          Alert.alert('Error', event.msg);
          break;
      }
    });
    return unsub;
  }, [subscribe]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft > 0 && !showResult) {
      timerRef.current = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft, showResult]);

  const handleAnswer = (choice: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(choice);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    send({ type: 'submit_answer', choice });
  };

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    send({ type: 'start_game' });
  };

  const handleSharePin = async () => {
    try { await Share.share({ message: `Join my Quiz Battle!\nPIN: ${pin}` }); } catch {}
  };

  const isHost = roomState?.host_name === user?.username;

  // Game Over screen
  if (gameOver && finalResults) {
    return (
      <Screen safeArea={false}>
        <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.md }}>Battle Complete!</Text>
          <LeaderboardView leaderboard={finalResults.leaderboard || leaderboard} colors={colors} />
          {finalResults.xp_awards && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: SPACING.sm }}>XP Earned</Text>
              {Array.isArray(finalResults.xp_awards)
                ? finalResults.xp_awards.map((entry: any, i: number) => {
                    const name = entry.username || entry.name || String(i);
                    const xp = entry.xp ?? entry.score ?? 0;
                    return <Text key={name + i} style={{ color: name === user?.username ? colors.primary : colors.text, fontSize: FONT_SIZE.sm }}>{name}: +{String(xp)} XP</Text>;
                  })
                : Object.entries(finalResults.xp_awards).map(([name, xp]) => (
                    <Text key={name} style={{ color: name === user?.username ? colors.primary : colors.text, fontSize: FONT_SIZE.sm }}>{name}: +{String(xp)} XP</Text>
                  ))
              }
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xl }}>
            <TouchableOpacity onPress={() => router.replace('/(tabs)/more/battle')} style={{ flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Screen>
    );
  }

  // Lobby — only show when explicitly in lobby state and no countdown/question active
  const inLobby = (roomState?.status === 'lobby' || !roomState) && countdown === null && !currentQuestion && !gameOver && !showResult;
  if (inLobby) {
    return (
      <Screen safeArea={false}>
        <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '800' }} numberOfLines={1}>{roomState?.title || 'Quiz Battle'}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>PIN: {pin}</Text>
            </View>
            <TouchableOpacity onPress={handleSharePin} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="share-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.md }}>PLAYERS ({players.length})</Text>
          {players.map((p) => (
            <PlayerCard key={p.username || p.id} player={p} isHost={roomState?.host_name === p.username} isMe={p.username === user?.username} colors={colors} />
          ))}

          {wsStatus !== 'connected' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Connecting...</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />
          {isHost ? (
            <TouchableOpacity onPress={handleStart} disabled={players.length < 1} style={{ backgroundColor: players.length < 1 ? colors.border : '#ef4444', borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.xl }}>
              <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>Start Battle</Text>
              {players.length < 1 && <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 4 }}>Waiting for players...</Text>}
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.xl, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>Waiting for host to start...</Text>
            </View>
          )}
        </View>
      </Screen>
    );
  }

  // Countdown
  if (countdown !== null) {
    return (
      <Screen safeArea={false}>
        <View style={{ flex: 1 }}>
          <CountdownOverlay count={countdown} colors={colors} />
        </View>
      </Screen>
    );
  }

  // Question
  if (currentQuestion && !showResult) {
    return (
      <Screen safeArea={false}>
        <View style={{ flex: 1 }}>
          <QuestionView question={currentQuestion} qIdx={qIdx} total={totalQ} timeLeft={timeLeft} selectedAnswer={selectedAnswer} onSelect={handleAnswer} colors={colors} />
        </View>
      </Screen>
    );
  }

  // Round Result
  if (showResult && roundResult) {
    return (
      <Screen safeArea={false}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.md }}>Round Result</Text>
            <View style={{ backgroundColor: '#22c55e' + '15', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#22c55e' + '30', alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: 4 }}>Correct Answer</Text>
              <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.xl, fontWeight: '800' }}>{roundResult.correct}</Text>
              {roundResult.explanation ? <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, textAlign: 'center' }}>{roundResult.explanation}</Text> : null}
            </View>
            <LeaderboardView leaderboard={roundResult.leaderboard} colors={colors} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginTop: SPACING.md }}>Loading battle...</Text>
      </View>
    </Screen>
  );
}
