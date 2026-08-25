import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { usePodcastStatus, useInterruptPodcast } from '@/hooks/usePodcast';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { PodcastChunk } from '@/types';
import { podcastService } from '@/services/podcast';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function PodcastPlayerScreen({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const colors = useThemeColors();
  const { data: statusData } = usePodcastStatus(sessionId);
  const interruptMutation = useInterruptPodcast();

  const [chunks, setChunks] = useState<PodcastChunk[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showRecorder, setShowRecorder] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (statusData?.script) setChunks(statusData.script);
  }, [statusData?.script]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const loadChunk = useCallback(async (index: number) => {
    if (index < 0 || index >= chunks.length) return;
    const sound = soundRef.current;
    if (sound) await sound.unloadAsync();

    const remoteUrl = podcastService.getChunkUrl(sessionId, index);
    const cacheKey = `podcast_${sessionId}_${index}.mp3`;
    const cachedFile = new File(Paths.cache, cacheKey);

    let playableUri = remoteUrl;
    try {
      await cachedFile.text();
      playableUri = cachedFile.uri;
    } catch {
      try {
        const token = await SecureStore.getItemAsync('flowstate_access_token');
        const downloaded = await File.downloadFileAsync(remoteUrl, new File(Paths.cache, cacheKey), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          idempotent: true,
        });
        playableUri = downloaded.uri;
      } catch (e) {
        if (__DEV__) console.warn('Chunk download failed, trying direct URL:', e);
      }
    }

    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: playableUri },
      { shouldPlay: true, rate: speed },
      (s: AVPlaybackStatus) => {
        if (s.isLoaded) {
          setPosition(s.positionMillis);
          setDuration(s.durationMillis || 0);
          setIsPlaying(s.isPlaying);
          if (s.didJustFinish && !s.isLooping) {
            loadChunk(index + 1);
          }
        }
      }
    );
    soundRef.current = newSound;
    setCurrentIndex(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [chunks, sessionId, speed]);

  useEffect(() => {
    if (chunks.length > 0 && currentIndex < chunks.length) {
      loadChunk(currentIndex);
    }
  }, [chunks.length]);

  const togglePlayPause = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    if (isPlaying) await sound.pauseAsync();
    else await sound.playAsync();
  }, [isPlaying]);

  const seek = useCallback(async (ms: number) => {
    await soundRef.current?.setPositionAsync(ms);
  }, []);

  const changeSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    soundRef.current?.setRateAsync(next, true);
  }, [speed]);

  const handleInterrupt = useCallback(async (uri: string, blob: Blob) => {
    setShowRecorder(false);
    setIsInterrupting(true);
    try {
      const result = await interruptMutation.mutateAsync({ sessionId, audioBlob: blob, currentIndex });
      if (result.status === 'ok') {
        setChunks(result.script);
        setTranscriptText(result.transcribed_query || '');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to process question.');
    }
    setIsInterrupting(false);
  }, [sessionId, currentIndex, interruptMutation]);

  const currentChunk = chunks[currentIndex];
  const speakerColor = currentChunk?.speaker === 'A' ? '#8b5cf6' : colors.primary;
  const speakerName = currentChunk?.speaker === 'A' ? (statusData?.voice_a?.split('-').pop() || 'Host A') : (statusData?.voice_b?.split('-').pop() || 'Host B');
  const progress = duration > 0 ? position / duration : 0;
  const overallProgress = chunks.length > 0 ? ((currentIndex + progress) / chunks.length) * 100 : 0;

  return (
    <Screen safeArea={false}>
      <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg }}>
          <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', textAlign: 'center' }}>Podcast</Text>
          <TouchableOpacity onPress={() => setShowRecorder(!showRecorder)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: showRecorder ? colors.primary + '20' : colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: showRecorder ? colors.primary : colors.border }}>
            <Ionicons name="chatbubble" size={16} color={showRecorder ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: SPACING.lg, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${overallProgress}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
        </View>

        <ScrollView ref={scrollViewRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {chunks.map((chunk, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: SPACING.md, opacity: i === currentIndex ? 1 : 0.4 }}>
              <View style={{ width: 3, borderRadius: 2, backgroundColor: chunk.speaker === 'A' ? '#8b5cf6' : colors.primary, marginRight: SPACING.sm, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: chunk.speaker === 'A' ? '#8b5cf6' : colors.primary, fontSize: 10, fontWeight: '700', marginBottom: 2 }}>
                  {chunk.speaker === 'A' ? (statusData?.voice_a?.split('-').pop() || 'A') : (statusData?.voice_b?.split('-').pop() || 'B')}
                </Text>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 18 }}>{chunk.text}</Text>
              </View>
              {i === currentIndex && isPlaying && (
                <View style={{ marginLeft: SPACING.sm, alignSelf: 'center' }}>
                  <Ionicons name="volume-high" size={14} color={colors.primary} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {isInterrupting && (
          <View style={{ backgroundColor: colors.primary + '15', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm }}>Processing your question...</Text>
          </View>
        )}

        {showRecorder && (
          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: SPACING.xs }}>Ask a question during the podcast</Text>
            <VoiceRecorder onRecorded={handleInterrupt} onCancel={() => setShowRecorder(false)} colors={colors} />
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border }}>
          <TouchableOpacity onPress={() => loadChunk(Math.max(0, currentIndex - 1))} style={{ padding: SPACING.sm }}>
            <Ionicons name="play-skip-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => seek(Math.max(0, position - 15000))} style={{ padding: SPACING.sm }}>
            <Ionicons name="play-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlayPause} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#ffffff" style={isPlaying ? {} : { marginLeft: 3 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => seek(Math.min(duration, position + 30000))} style={{ padding: SPACING.sm }}>
            <Ionicons name="play-forward" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={changeSpeed} style={{ padding: SPACING.sm }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{speed}x</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}
