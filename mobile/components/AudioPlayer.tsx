import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

interface AudioPlayerProps {
  uri: string;
  colors: any;
  style?: any;
  showProgress?: boolean;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
}

export function AudioPlayer({ uri, colors, style, showProgress = true, onPlaybackStatusUpdate }: AudioPlayerProps) {
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isPlaying = status?.isLoaded && status.isPlaying;
  const duration = status?.isLoaded ? status.durationMillis || 0 : 0;
  const position = status?.isLoaded ? status.positionMillis || 0 : 0;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false }, (s) => {
          if (mounted) {
            setStatus(s);
            onPlaybackStatusUpdate?.(s);
          }
        });
        if (mounted) soundRef.current = sound;
      } catch (e) {
        if (__DEV__) console.warn('Audio load failed:', e);
      }
    };
    load();
    return () => {
      mounted = false;
      soundRef.current?.unloadAsync();
    };
  }, [uri]);

  const togglePlay = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playAsync();
    }
  }, [isPlaying]);

  const seek = useCallback(async (ms: number) => {
    await soundRef.current?.setPositionAsync(ms);
  }, []);

  const skip = useCallback(async (deltaMs: number) => {
    const s = soundRef.current;
    if (!s || !status?.isLoaded) return;
    await s.setPositionAsync(Math.max(0, Math.min(status.durationMillis || 0, status.positionMillis + deltaMs)));
  }, [status]);

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, style]}>
      <TouchableOpacity onPress={togglePlay} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#ffffff" />
      </TouchableOpacity>
      {showProgress && (
        <>
          <TouchableOpacity onPress={() => skip(-15000)} style={{ padding: 4 }}>
            <Ionicons name="play-back" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 9 }}>{formatTime(position)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 9 }}>{formatTime(duration)}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => skip(15000)} style={{ padding: 4 }}>
            <Ionicons name="play-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

interface PlaybackSpeedButtonProps {
  currentSpeed: number;
  onPress: () => void;
  colors: any;
}

export function PlaybackSpeedButton({ currentSpeed, onPress, colors }: PlaybackSpeedButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{currentSpeed}x</Text>
    </TouchableOpacity>
  );
}
