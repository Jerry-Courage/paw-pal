import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Button } from '@/components/ui';
import { useCheckExistingPodcast, useInitPodcast } from '@/hooks/usePodcast';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import PodcastPlayerScreen from './[sessionId]';

const VOICES = [
  { label: 'Andrew (Deep)', id: 'en-US-AndrewNeural' },
  { label: 'Ava (Warm)', id: 'en-US-AvaNeural' },
  { label: 'Emma (Bright)', id: 'en-US-EmmaNeural' },
  { label: 'Christopher (Authoritative)', id: 'en-US-ChristopherNeural' },
  { label: 'Brian (Friendly)', id: 'en-US-BrianNeural' },
  { label: 'Sara (Professional)', id: 'en-US-SaraNeural' },
  { label: 'Guy (Conversational)', id: 'en-US-GuyNeural' },
  { label: 'Tony (Energetic)', id: 'en-US-TonyNeural' },
];

export default function PodcastScreen() {
  const { resourceId, resourceTitle } = useLocalSearchParams<{ resourceId: string; resourceTitle: string }>();
  const colors = useThemeColors();
  const rid = Number(resourceId);
  const existingQuery = useCheckExistingPodcast(rid);
  const initMutation = useInitPodcast();
  const [selectedVoiceA, setSelectedVoiceA] = useState(VOICES[0].id);
  const [selectedVoiceB, setSelectedVoiceB] = useState(VOICES[1].id);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const existing = existingQuery.data;

  if (activeSessionId) {
    return <PodcastPlayerScreen sessionId={activeSessionId} onClose={() => setActiveSessionId(null)} />;
  }

  if (existing?.exists && existing.status === 'ready') {
    return (
      <Screen>
        <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', textAlign: 'center' }}>AI Podcast</Text>
          </View>
          <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
              <Ionicons name="headset" size={36} color="#8b5cf6" />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: 4 }}>Podcast Ready</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>{resourceTitle || 'Your resource'} has a podcast available</Text>
          </View>
          <Button title="Play Podcast" onPress={() => setActiveSessionId(existing.session_id)} style={{ backgroundColor: '#8b5cf6', marginBottom: SPACING.sm }} />
          <Button title="Generate New" onPress={() => {
            Alert.alert('Generate New', 'This will create a new podcast version.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Generate', onPress: handleGenerate },
            ]);
          }} variant="outline" />
        </View>
      </Screen>
    );
  }

  if (existingQuery.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const handleGenerate = () => {
    initMutation.mutate(
      { resourceId: rid, voiceA: selectedVoiceA, voiceB: selectedVoiceB },
      {
        onSuccess: (data) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (data.status === 'ready') {
            setActiveSessionId(data.session_id);
          } else {
            existingQuery.refetch();
          }
        },
        onError: (err: any) => {
          Alert.alert('Error', err?.response?.data?.error || 'Failed to generate podcast.');
        },
      }
    );
  };

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', textAlign: 'center' }}>Generate Podcast</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
              <Ionicons name="mic" size={36} color="#8b5cf6" />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 4 }}>AI Podcast</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>Two AI hosts discuss your study material</Text>
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm }}>HOST A VOICE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
            {VOICES.map((v) => (
              <TouchableOpacity key={v.id} onPress={() => setSelectedVoiceA(v.id)} style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: selectedVoiceA === v.id ? '#8b5cf6' + '20' : colors.card, borderWidth: 1, borderColor: selectedVoiceA === v.id ? '#8b5cf6' : colors.border, marginRight: SPACING.sm }}>
                <Text style={{ color: selectedVoiceA === v.id ? '#8b5cf6' : colors.text, fontSize: 12, fontWeight: '600' }}>{v.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm }}>HOST B VOICE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.xl }}>
            {VOICES.map((v) => (
              <TouchableOpacity key={v.id} onPress={() => setSelectedVoiceB(v.id)} style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: selectedVoiceB === v.id ? colors.primary + '20' : colors.card, borderWidth: 1, borderColor: selectedVoiceB === v.id ? colors.primary : colors.border, marginRight: SPACING.sm }}>
                <Text style={{ color: selectedVoiceB === v.id ? colors.primary : colors.text, fontSize: 12, fontWeight: '600' }}>{v.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </ScrollView>

        <Button
          title={initMutation.isPending ? 'Generating...' : 'Generate Podcast'}
          onPress={handleGenerate}
          disabled={initMutation.isPending}
          style={{ backgroundColor: '#8b5cf6', marginBottom: SPACING.md }}
        />
      </View>
    </Screen>
  );
}
