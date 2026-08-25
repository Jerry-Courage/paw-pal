import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Share, ActivityIndicator, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Screen, Skeleton } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { useWorkspace, useWorkspaceMessages, useSendMessage, useDeleteMessage, useShareResource } from '@/hooks/useCollab';
import { useWorkspaceSocket } from '@/hooks/useWorkspaceSocket';
import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { WorkspaceMessage } from '@/types';
import api from '@/services/api';

const MessageBubble = React.memo(function MessageBubble({ msg, isOwn, onReply, onLongPress, colors }: {
  msg: WorkspaceMessage; isOwn: boolean; onReply: () => void; onLongPress: () => void; colors: any;
}) {
  const bubbleColor = msg.is_ai ? '#8b5cf6' + '18' : isOwn ? colors.primary + '18' : colors.card;
  const borderColor = msg.is_ai ? '#8b5cf6' + '40' : isOwn ? colors.primary + '40' : colors.border;

  return (
    <TouchableOpacity onLongPress={onLongPress} activeOpacity={0.8} style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, maxWidth: '85%', alignSelf: isOwn ? 'flex-end' : 'flex-start' }}>
      <View style={{ backgroundColor: bubbleColor, borderRadius: RADIUS.lg, borderTopRightRadius: isOwn ? 4 : RADIUS.lg, borderTopLeftRadius: isOwn ? RADIUS.lg : 4, padding: SPACING.md, borderWidth: 1, borderColor }}>
        {!isOwn && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            {msg.is_ai && <Ionicons name="sparkles" size={10} color="#8b5cf6" />}
            <Text style={{ color: msg.is_ai ? '#8b5cf6' : colors.primary, fontSize: 10, fontWeight: '700' }}>{msg.author_name}</Text>
          </View>
        )}
        {msg.parent_data && (
          <View style={{ backgroundColor: colors.background, borderRadius: RADIUS.sm, padding: SPACING.xs, marginBottom: SPACING.xs, borderLeftWidth: 2, borderLeftColor: colors.primary }}>
            <Text style={{ color: colors.textSecondary, fontSize: 9 }} numberOfLines={1}>{msg.parent_data.author_name}: {msg.parent_data.content}</Text>
          </View>
        )}
        {msg.audio_file && (
          <View style={{ marginBottom: msg.content ? SPACING.xs : 0 }}>
            <AudioPlayer uri={msg.audio_file} colors={colors} />
          </View>
        )}
        {msg.audio_data && msg.audio_data.startsWith('data:audio') && (
          <View style={{ marginBottom: msg.content ? SPACING.xs : 0 }}>
            <AudioPlayer uri={msg.audio_data} colors={colors} />
          </View>
        )}
        {msg.attachment && (
          <View style={{ marginBottom: msg.content ? SPACING.xs : 0 }}>
            {msg.attachment_type === 'image' ? (
              <Image source={{ uri: msg.attachment }} style={{ width: 200, height: 150, borderRadius: RADIUS.md }} resizeMode="cover" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.sm }}>
                <Ionicons name="document" size={20} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 10, flex: 1 }} numberOfLines={1}>{msg.attachment.split('/').pop()}</Text>
              </View>
            )}
          </View>
        )}
        {msg.pinned_resource && (
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: msg.content ? SPACING.xs : 0, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
            <Ionicons name="book" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{msg.pinned_resource_data?.title || 'Shared Resource'}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 9 }}>Tap to open</Text>
            </View>
          </TouchableOpacity>
        )}
        {msg.content ? <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, lineHeight: 18 }}>{msg.content}</Text> : null}
        <Text style={{ color: colors.textSecondary, fontSize: 9, marginTop: 4 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <TouchableOpacity onPress={onReply} style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start', marginTop: 2 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 9 }}>Reply</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

function TypingIndicator({ users, colors }: { users: string[]; colors: any }) {
  if (users.length === 0) return null;
  const text = users.length === 1 ? `${users[0]} is typing...` : `${users.join(', ')} are typing...`;
  return (
    <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs }}>
      <Text style={{ color: colors.textSecondary, fontSize: 10, fontStyle: 'italic' }}>{text}</Text>
    </View>
  );
}

function ConnectionBanner({ status, colors }: { status: string; colors: any }) {
  if (status === 'connected') return null;
  const labels: Record<string, { text: string; color: string }> = {
    connecting: { text: 'Connecting...', color: '#eab308' },
    reconnecting: { text: 'Reconnecting...', color: '#eab308' },
    disconnected: { text: 'Disconnected', color: '#ef4444' },
  };
  const info = labels[status] || labels.disconnected;
  return (
    <View style={{ backgroundColor: info.color + '18', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: info.color + '30' }}>
      <Text style={{ color: info.color, fontSize: 10, textAlign: 'center', fontWeight: '600' }}>{info.text}</Text>
    </View>
  );
}

function normalizeWsMessage(raw: any): WorkspaceMessage {
  return {
    id: raw.id,
    author: raw.author ?? null,
    author_name: raw.author_name ?? 'Unknown',
    author_initials: raw.author_initials ?? '?',
    content: raw.content ?? '',
    is_ai: raw.is_ai ?? false,
    pinned_resource: raw.pinned_resource ?? null,
    pinned_resource_data: raw.pinned_resource_data ?? null,
    shared_assignment: raw.shared_assignment ?? null,
    shared_assignment_data: raw.shared_assignment_data ?? null,
    audio_file: raw.audio_file ?? null,
    audio_data: raw.audio_data ?? null,
    attachment: raw.attachment ?? null,
    attachment_type: raw.attachment_type ?? null,
    parent: raw.parent ?? null,
    parent_data: raw.parent_data ?? null,
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

export default function WorkspaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = Number(id);
  const colors = useThemeColors();
  const { user } = useAuth();
  const workspaceQuery = useWorkspace(workspaceId);
  const messagesQuery = useWorkspaceMessages(workspaceId);
  const sendMessage = useSendMessage(workspaceId);
  const deleteMessage = useDeleteMessage(workspaceId);
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<WorkspaceMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentContentRef = useRef<Set<string>>(new Set());

  const ws = workspaceQuery.data;
  const { status: wsStatus, send, sendTyping, subscribe } = useWorkspaceSocket(workspaceId);

  useEffect(() => { messagesQuery.refetch(); }, []);

  useEffect(() => {
    if (messagesQuery.data) setMessages(messagesQuery.data);
  }, [messagesQuery.data]);

  useEffect(() => {
    const unsub = subscribe((event) => {
      if (event.type === 'broadcast_chat_message') {
        const raw = event as any;
        const normalized = normalizeWsMessage(raw);
        setMessages((prev) => {
          if (normalized.id && prev.find((m) => m.id === normalized.id)) return prev;
          const contentKey = `${normalized.author?.id || 0}:${normalized.content}`;
          if (sentContentRef.current.has(contentKey)) {
            sentContentRef.current.delete(contentKey);
            return prev;
          }
          return [...prev, normalized];
        });
      }
      if (event.type === 'broadcast_typing') {
        const e = event as { type: string; user: string; is_typing: boolean };
        if (e.user !== user?.username) {
          setTypingUsers((prev) => e.is_typing ? [...new Set([...prev, e.user])] : prev.filter((u) => u !== e.user));
        }
      }
      if (event.type === 'broadcast_chat_message_delete') {
        const e = event as { type: string; message_id: number };
        setMessages((prev) => prev.filter((m) => m.id !== e.message_id));
      }
      if (event.type === 'broadcast_chat_message_edit') {
        const e = event as { type: string; message: WorkspaceMessage };
        setMessages((prev) => prev.map((m) => m.id === e.message.id ? e.message : m));
      }
    });
    return unsub;
  }, [subscribe, user?.username]);

  const sendWithPayload = useCallback(async (payload: {
    content?: string;
    parent_id?: number;
    audio?: { uri: string; name: string; type: string };
    attachment?: { uri: string; name: string; type: string };
    attachment_type?: string;
  }) => {
    const content = payload.content || '';
    const optimisticMsg: WorkspaceMessage = {
      id: -(Date.now()),
      author: user ? { id: user.id, username: user.username, first_name: user.first_name, last_name: user.last_name, avatar: user.avatar_url } : null,
      author_name: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username || 'You',
      author_initials: user?.first_name ? user.first_name[0] : user?.username?.[0] || '?',
      content: content || (payload.audio ? 'Voice Note' : payload.attachment ? 'Attachment' : ''),
      is_ai: false,
      pinned_resource: null, pinned_resource_data: null,
      shared_assignment: null, shared_assignment_data: null,
      audio_file: null, audio_data: null,
      attachment: null, attachment_type: null,
      parent: payload.parent_id || null,
      parent_data: replyTo ? { id: replyTo.id, author_name: replyTo.author_name, content: replyTo.content.slice(0, 100) } : null,
      created_at: new Date().toISOString(),
    };
    if (content) {
      const contentKey = `${user?.id || 0}:${content}`;
      sentContentRef.current.add(contentKey);
    }
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    sendMessage.mutate(payload, {
      onSuccess: (savedMsg) => {
        setMessageText(''); setReplyTo(null);
        if (savedMsg?.id) setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? savedMsg : m));
      },
      onError: () => {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        Alert.alert('Error', 'Failed to send message.');
      },
    });
  }, [user, replyTo, sendMessage]);

  const handleSend = () => {
    if (!messageText.trim()) return;
    const content = replyTo ? `> ${replyTo.content.slice(0, 50)}...\n\n${messageText.trim()}` : messageText.trim();
    sendWithPayload({ content, parent_id: replyTo?.id });
    sendTyping(false);
  };

  const handleVoiceRecorded = (uri: string, blob: Blob) => {
    setShowVoiceRecorder(false);
    sendWithPayload({
      audio: { uri, name: `voice_${Date.now()}.webm`, type: 'audio/webm' },
      parent_id: replyTo?.id,
    });
  };

  const handlePickImage = async () => {
    setShowAttachMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      sendWithPayload({
        attachment: { uri: asset.uri, name: asset.fileName || `image_${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' },
        attachment_type: 'image',
        parent_id: replyTo?.id,
      });
    }
  };

  const handleTakePhoto = async () => {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera permission is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      sendWithPayload({
        attachment: { uri: asset.uri, name: asset.fileName || `photo_${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' },
        attachment_type: 'image',
        parent_id: replyTo?.id,
      });
    }
  };

  const handlePickDocument = async () => {
    setShowAttachMenu(false);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      sendWithPayload({
        attachment: { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' },
        attachment_type: 'document',
        parent_id: replyTo?.id,
      });
    }
  };

  const handleShareResource = async (resourceId: number) => {
    setShowResourcePicker(false);
    try {
      await api.post(`/workspace/workspaces/${workspaceId}/share_resource/`, { resource_id: resourceId });
      messagesQuery.refetch();
    } catch {
      Alert.alert('Error', 'Failed to share resource.');
    }
  };

  const handleTyping = (text: string) => {
    setMessageText(text);
    sendTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => sendTyping(false), 2000);
  };

  const handleLongPress = (msg: WorkspaceMessage) => {
    const isOwn = msg.author?.id === user?.id;
    const opts: Array<{ text: string; onPress?: () => void; style?: string }> = [
      { text: 'Reply', onPress: () => setReplyTo(msg) },
    ];
    if (isOwn) opts.push({ text: 'Delete', style: 'destructive', onPress: () => deleteMessage.mutate(msg.id) });
    Alert.alert('Message', '', opts.map((o) => ({ text: o.text, onPress: o.onPress, style: o.style as any })));
  };

  const handleShareInvite = async () => {
    if (!ws) return;
    try { await Share.share({ message: `Join my workspace "${ws.name}" on FlowState!\nInvite code: ${ws.invite_code}` }); } catch {}
  };

  if (workspaceQuery.isLoading || (messagesQuery.isLoading && messages.length === 0)) {
    return (
      <Screen safeArea={false}>
        <Skeleton height={50} borderRadius={RADIUS.lg} style={{ margin: SPACING.lg }} />
        <Skeleton height={400} borderRadius={RADIUS.lg} style={{ marginHorizontal: SPACING.lg }} />
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }} numberOfLines={1}>{ws?.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: wsStatus === 'connected' ? '#22c55e' : '#ef4444' }} />
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{ws?.members?.length || 0} members</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowResourcePicker(!showResourcePicker)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: showResourcePicker ? colors.primary + '20' : colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: showResourcePicker ? colors.primary : colors.border, marginRight: SPACING.sm }}>
            <Ionicons name="book" size={14} color={showResourcePicker ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShareInvite} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="share-outline" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ConnectionBanner status={wsStatus} colors={colors} />

        {showResourcePicker && (
          <ResourcePicker workspaceId={workspaceId} onSelect={handleShareResource} onClose={() => setShowResourcePicker(false)} colors={colors} />
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <MessageBubble msg={item} isOwn={item.author?.id === user?.id} onReply={() => setReplyTo(item)} onLongPress={() => handleLongPress(item)} colors={colors} />
          )}
          contentContainerStyle={{ paddingVertical: SPACING.md }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={<TypingIndicator users={typingUsers} colors={colors} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xxl }}>
              <Ionicons name="chatbubbles-outline" size={36} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm }}>No messages yet. Say hello!</Text>
            </View>
          }
        />

        <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
          {replyTo && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.md, padding: SPACING.xs, marginBottom: SPACING.xs, borderLeftWidth: 2, borderLeftColor: colors.primary }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, flex: 1 }} numberOfLines={1}>Replying to {replyTo.author_name}: {replyTo.content}</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)}><Ionicons name="close" size={14} color={colors.textSecondary} /></TouchableOpacity>
            </View>
          )}
          {showVoiceRecorder ? (
            <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setShowVoiceRecorder(false)} colors={colors} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm }}>
              <TouchableOpacity onPress={() => setShowAttachMenu(!showAttachMenu)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name={showAttachMenu ? 'close' : 'add'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TextInput
                value={messageText}
                onChangeText={handleTyping}
                placeholder="Message..."
                placeholderTextColor={colors.textSecondary}
                multiline
                style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, maxHeight: 100 }}
              />
              {messageText.trim() ? (
                <TouchableOpacity onPress={handleSend} disabled={sendMessage.isPending} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  {sendMessage.isPending ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={16} color="#ffffff" />}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setShowVoiceRecorder(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#ef4444' + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          )}
          {showAttachMenu && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: SPACING.sm, marginTop: SPACING.xs, backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border }}>
              <TouchableOpacity onPress={handleTakePhoto} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="camera" size={18} color={colors.primary} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 9 }}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickImage} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="images" size={18} color="#8b5cf6" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 9 }}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickDocument} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="document" size={18} color="#22c55e" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 9 }}>File</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAttachMenu(false); setShowVoiceRecorder(true); }} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ef4444' + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={18} color="#ef4444" />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 9 }}>Voice</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ResourcePicker({ workspaceId, onSelect, onClose, colors }: { workspaceId: number; onSelect: (id: number) => void; onClose: () => void; colors: any }) {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/library/resources/').then((res) => {
      setResources(res.data.results || res.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 200 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', flex: 1 }}>Share from Library</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={16} color={colors.textSecondary} /></TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ padding: SPACING.md }} />
      ) : (
        <FlatList
          data={resources}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onSelect(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Ionicons name="book" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>{item.title}</Text>
              <Ionicons name="add-circle" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', padding: SPACING.md }}>No resources yet</Text>}
        />
      )}
    </View>
  );
}
