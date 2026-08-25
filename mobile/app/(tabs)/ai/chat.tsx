import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Image, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Screen } from '@/components/ui';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { useAiChat } from '@/hooks/useAiChat';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { ChatMessage } from '@/types';
import api from '@/services/api';

const PROMPT_SUGGESTIONS: Record<string, string> = {
  explain: 'Can you explain the key concepts from my study material?',
  quiz: 'Quiz me on what I\'ve been studying',
  assignment: 'Help me understand this assignment better',
};

function MessageBubble({ message, colors }: { message: ChatMessage; colors: any }) {
  const isUser = message.role === 'user';
  const [audioStatus, setAudioStatus] = useState<AVPlaybackStatus | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isAudioPlaying = audioStatus?.isLoaded && audioStatus.isPlaying;

  useEffect(() => {
    if (message.audio_url) {
      Audio.Sound.createAsync({ uri: message.audio_url }, { shouldPlay: false }, setAudioStatus).then(({ sound }) => {
        soundRef.current = sound;
      });
    }
    return () => { soundRef.current?.unloadAsync(); };
  }, [message.audio_url]);

  const toggleAudio = async () => {
    if (!soundRef.current) return;
    if (isAudioPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
      <View style={{ maxWidth: '82%', backgroundColor: isUser ? colors.primary : colors.card, borderRadius: RADIUS.lg, borderTopRightRadius: isUser ? RADIUS.sm : RADIUS.lg, borderTopLeftRadius: isUser ? RADIUS.lg : RADIUS.sm, padding: SPACING.md, borderWidth: isUser ? 0 : 1, borderColor: colors.border, overflow: 'hidden' }}>
        {message.image ? (
          <Image source={{ uri: message.image }} style={{ width: 200, height: 150, borderRadius: RADIUS.md, marginBottom: message.content ? SPACING.sm : 0 }} resizeMode="cover" />
        ) : null}
        {message.content ? (
          <Text style={{ color: isUser ? '#ffffff' : colors.text, fontSize: FONT_SIZE.sm, lineHeight: 22 }} selectable>{message.content}</Text>
        ) : null}
        {message.audio_url ? (
          <TouchableOpacity onPress={toggleAudio} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: message.content ? SPACING.sm : 0, backgroundColor: isUser ? '#ffffff20' : colors.background, borderRadius: RADIUS.md, padding: SPACING.sm }}>
            <Ionicons name={isAudioPlaying ? 'pause' : 'play'} size={16} color={isUser ? '#ffffff' : colors.primary} />
            <Text style={{ color: isUser ? '#ffffff' : colors.textSecondary, fontSize: 11 }}>Voice response</Text>
          </TouchableOpacity>
        ) : null}
        {message.diagram_code ? (
          <View style={{ marginTop: SPACING.sm, backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.sm }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontStyle: 'italic' }}>Diagram available on web version</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ThinkingIndicator({ colors }: { colors: any }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
      <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, borderTopLeftRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
        <Ionicons name="sparkles" size={14} color={colors.primary} />
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '500' }}>Flow is thinking...</Text>
      </View>
    </View>
  );
}

function ErrorBubble({ error, onRetry, colors }: { error: string; onRetry: () => void; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
      <View style={{ backgroundColor: '#ef4444' + '10', borderRadius: RADIUS.lg, borderTopLeftRadius: RADIUS.sm, padding: SPACING.md, borderWidth: 1, borderColor: '#ef4444' + '30', maxWidth: '82%' }}>
        <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: 4 }}>Flow couldn't answer that.</Text>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm }} numberOfLines={2}>{error}</Text>
        <TouchableOpacity onPress={onRetry} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="refresh" size={12} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AiChatScreen() {
  const { sessionId, prompt, resourceId } = useLocalSearchParams<{ sessionId?: string; prompt?: string; resourceId?: string }>();
  const colors = useThemeColors();
  const chat = useAiChat();
  const [input, setInput] = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const loadedSessionRef = useRef<number | null>(null);

  const numericSessionId = sessionId ? Number(sessionId) : undefined;
  const numericResourceId = resourceId ? Number(resourceId) : undefined;

  useEffect(() => {
    if (numericSessionId && loadedSessionRef.current !== numericSessionId) {
      loadedSessionRef.current = numericSessionId;
      chat.loadSession(numericSessionId);
    }
  }, [numericSessionId]);

  useEffect(() => {
    if (prompt && PROMPT_SUGGESTIONS[prompt]) setInput(PROMPT_SUGGESTIONS[prompt]);
  }, [prompt]);

  useEffect(() => {
    if (chat.messages.length > 0 || chat.isThinking) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chat.messages.length, chat.isThinking]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if ((!text && !attachedImage) || chat.isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = text || (attachedImage ? 'What do you see in this image?' : '');
    setInput('');
    setAttachedImage(null);
    chat.sendMessage(message, numericSessionId, numericResourceId, attachedImage || undefined);
  }, [input, attachedImage, chat.isLoading, numericSessionId, numericResourceId]);

  const handleVoiceRecorded = async (uri: string, blob: Blob) => {
    setShowVoiceRecorder(false);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      const res = await api.post('/ai/agent/audio/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.query) setInput(res.data.query);
      else if (res.data.reply) {
        const userMsg: ChatMessage = { id: Date.now(), role: 'user', content: res.data.query || '[Voice message]', image: null, diagram: null, diagram_code: null, audio_url: null, created_at: new Date().toISOString() };
        const assistantMsg: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: res.data.reply, image: null, diagram: null, diagram_code: null, audio_url: res.data.audio_url || null, created_at: new Date().toISOString() };
        chat.sendMessage(res.data.query, numericSessionId, numericResourceId);
      }
    } catch {
      Alert.alert('Error', 'Failed to transcribe voice message.');
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setAttachedImage(result.assets[0].uri);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera permission is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) setAttachedImage(result.assets[0].uri);
  };

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => <MessageBubble message={item} colors={colors} />, [colors]);
  const keyExtractor = useCallback((item: ChatMessage) => String(item.id), []);
  const listData = chat.isThinking
    ? [...chat.messages, { id: -1, role: 'assistant' as const, content: '', image: null, diagram: null, diagram_code: null, audio_url: null, created_at: '' }]
    : chat.messages;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md, backgroundColor: colors.background }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>Flow AI</Text>
          {numericResourceId && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="document-text" size={10} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 10 }}>Using resource context</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => { chat.resetChat(); loadedSessionRef.current = null; }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="add" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList ref={flatListRef} data={listData} keyExtractor={keyExtractor} renderItem={renderItem} contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: SPACING.sm }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!chat.isLoading && !chat.isThinking ? (
          <View style={{ alignItems: 'center', paddingVertical: 120, paddingHorizontal: SPACING.xxl }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg }}>
              <Ionicons name="chatbubble-ellipses" size={28} color={colors.primary} />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.xs }}>Ask me anything</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>I can help you understand concepts, solve problems, or prepare for exams.</Text>
          </View>
        ) : null}
        ListFooterComponent={<>{chat.isThinking && <ThinkingIndicator colors={colors} />}{chat.error && !chat.isLoading && <ErrorBubble error={chat.error} onRetry={() => chat.sendMessage(chat.messages[chat.messages.length - 1]?.content || '', numericSessionId, numericResourceId)} colors={colors} />}</>}
      />

      {attachedImage && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.md, padding: SPACING.xs, borderWidth: 1, borderColor: colors.border }}>
            <Image source={{ uri: attachedImage }} style={{ width: 40, height: 40, borderRadius: RADIUS.sm }} />
            <Text style={{ flex: 1, color: colors.text, fontSize: 11, marginLeft: SPACING.sm }}>Image attached</Text>
            <TouchableOpacity onPress={() => setAttachedImage(null)}><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
        {showVoiceRecorder ? (
          <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setShowVoiceRecorder(false)} colors={colors} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity onPress={handleTakePhoto} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="camera" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickImage} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="image" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput value={input} onChangeText={setInput} placeholder="Ask Flow AI..." placeholderTextColor={colors.textSecondary} multiline numberOfLines={1} style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, maxHeight: 120, borderWidth: 1, borderColor: colors.border }} />
            {input.trim() || attachedImage ? (
              <TouchableOpacity onPress={handleSend} disabled={chat.isLoading} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="arrow-up" size={20} color="#ffffff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setShowVoiceRecorder(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#ef4444' + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mic" size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
