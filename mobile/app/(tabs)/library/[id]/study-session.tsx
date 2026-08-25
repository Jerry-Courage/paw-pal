import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Button } from '@/components/ui';
import { useLogStudy } from '@/hooks/useStudy';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function StudySessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = Number(id);
  const colors = useThemeColors();
  const logStudy = useLogStudy();

  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const startTimeRef = useRef<number | null>(null);

  // Handle app background/foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current === 'active' && nextState.match(/inactive|background/)) {
        // App going to background - stop timer
        if (isRunning) {
          setIsRunning(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [isRunning]);

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now() - elapsed * 1000;
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const handleToggleTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRunning(!isRunning);
  }, [isRunning]);

  const handleComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const minutes = Math.max(1, Math.floor(elapsed / 60));
    logStudy.mutate(minutes, {
      onSuccess: (data) => {
        setXpEarned(data?.xp_earned || minutes);
        setCompleted(true);
      },
      onError: () => {
        setXpEarned(minutes);
        setCompleted(true);
      },
    });
  }, [elapsed, logStudy]);

  const handleReset = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRunning(false);
    setElapsed(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  if (completed) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl }}>
            <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
          </View>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800', marginBottom: SPACING.sm }}>
            Session Complete!
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.md, marginBottom: SPACING.sm }}>
            You studied for {formatTime(elapsed)}
          </Text>
          <Text style={{ color: colors.primary, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.xl }}>
            +{xpEarned} XP Earned
          </Text>
          <Button title="Done" variant="primary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
        <TouchableOpacity
          onPress={() => {
            if (elapsed > 0) {
              handleComplete();
            } else {
              router.back();
            }
          }}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginLeft: SPACING.md }}>
          Study Session
        </Text>
      </View>

      {/* Timer Display */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Circular progress indicator */}
        <View
          style={{
            width: 220,
            height: 220,
            borderRadius: 110,
            borderWidth: 6,
            borderColor: isRunning ? colors.primary + '30' : colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.card,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 48,
              fontWeight: '200',
              fontVariant: ['tabular-nums'],
              letterSpacing: 2,
            }}
          >
            {formatTime(elapsed)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: SPACING.sm }}>
            {isRunning ? 'Studying...' : elapsed > 0 ? 'Paused' : 'Ready to start'}
          </Text>
        </View>

        {/* Status indicator */}
        {isRunning && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
            <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Recording</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={{ paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.xxxl * 2, gap: SPACING.md }}>
        {/* Play/Pause */}
        <TouchableOpacity
          onPress={handleToggleTimer}
          activeOpacity={0.7}
          style={{
            backgroundColor: isRunning ? colors.warning : colors.primary,
            borderRadius: RADIUS.lg,
            paddingVertical: SPACING.lg,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: SPACING.sm,
          }}
        >
          <Ionicons
            name={isRunning ? 'pause' : 'play'}
            size={22}
            color="#ffffff"
          />
          <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.lg, fontWeight: '700' }}>
            {isRunning ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
          </Text>
        </TouchableOpacity>

        {/* Complete & Reset row */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TouchableOpacity
            onPress={handleComplete}
            disabled={elapsed === 0}
            activeOpacity={0.7}
            style={{
              flex: 1,
              backgroundColor: elapsed > 0 ? '#22c55e' + '15' : colors.muted,
              borderRadius: RADIUS.lg,
              paddingVertical: SPACING.md,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: elapsed > 0 ? '#22c55e' + '30' : colors.border,
              opacity: elapsed > 0 ? 1 : 0.5,
            }}
          >
            <Text style={{ color: elapsed > 0 ? '#22c55e' : colors.textSecondary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>
              Complete
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleReset}
            disabled={elapsed === 0}
            activeOpacity={0.7}
            style={{
              flex: 1,
              backgroundColor: elapsed > 0 ? '#ef4444' + '15' : colors.muted,
              borderRadius: RADIUS.lg,
              paddingVertical: SPACING.md,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: elapsed > 0 ? '#ef4444' + '30' : colors.border,
              opacity: elapsed > 0 ? 1 : 0.5,
            }}
          >
            <Text style={{ color: elapsed > 0 ? '#ef4444' : colors.textSecondary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>
              Reset
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}
