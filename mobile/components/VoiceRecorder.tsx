import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

interface VoiceRecorderProps {
  onRecorded: (uri: string, blob: Blob) => void;
  onCancel?: () => void;
  maxDurationMs?: number;
  colors: any;
}

export function VoiceRecorder({ onRecorded, onCancel, maxDurationMs = 60000, colors }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);
      startPulse();

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= maxDurationMs / 1000) {
            stopRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      if (__DEV__) console.warn('Recording failed:', e);
    }
  }, [maxDurationMs, startPulse]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopPulse();

    const rec = recordingRef.current;
    if (!rec) return;

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      if (uri) {
        const response = await fetch(uri);
        const blob = await response.blob();
        onRecorded(uri, blob);
      }
    } catch (e) {
      if (__DEV__) console.warn('Stop recording failed:', e);
    }

    recordingRef.current = null;
    setIsRecording(false);
    setDuration(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [onRecorded, stopPulse]);

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopPulse();
    const rec = recordingRef.current;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {}
    }
    recordingRef.current = null;
    setIsRecording(false);
    setDuration(0);
    onCancel?.();
  }, [onCancel, stopPulse]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!isRecording) {
    return (
      <TouchableOpacity onPress={startRecording} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#ef4444' + '20', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="mic" size={20} color="#ef4444" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 }}>
      <TouchableOpacity onPress={cancelRecording}>
        <Ionicons name="close-circle" size={28} color="#ef4444" />
      </TouchableOpacity>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#ef4444' }} />
      </Animated.View>
      <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.sm, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {formatDuration(duration)}
      </Text>
      <View style={{ flex: 1 }} />
      <TouchableOpacity onPress={stopRecording} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="stop" size={20} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}
