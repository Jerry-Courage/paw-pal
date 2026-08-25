import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton, Button } from '@/components/ui';
import { useWorkspaces, useCreateWorkspace, useJoinWorkspace } from '@/hooks/useCollab';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { WorkspaceListItem } from '@/types';

function WorkspaceCard({ ws, colors, onPress }: { ws: WorkspaceListItem; colors: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#8b5cf6' + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people" size={20} color="#8b5cf6" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{ws.name}</Text>
          {ws.subject ? <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>{ws.subject}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 }}>
            <Ionicons name="people" size={10} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{ws.member_count} member{ws.member_count !== 1 ? 's' : ''}</Text>
          </View>
        </View>
        {ws.unread_count > 0 && (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>{ws.unread_count > 9 ? '9+' : ws.unread_count}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function CollabIndexScreen() {
  const colors = useThemeColors();
  const workspacesQuery = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const joinWorkspace = useJoinWorkspace();
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const workspaces = workspacesQuery.data || [];

  const onRefresh = async () => {
    setRefreshing(true);
    await workspacesQuery.refetch();
    setRefreshing(false);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createWorkspace.mutate({ name: newName.trim(), subject: newSubject.trim() || undefined }, {
      onSuccess: (ws) => {
        setShowCreate(false);
        setNewName('');
        setNewSubject('');
        router.push({ pathname: '/(tabs)/more/collab/[id]', params: { id: String(ws.id) } });
      },
      onError: () => Alert.alert('Error', 'Could not create workspace.'),
    });
  };

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    joinWorkspace.mutate(inviteCode.trim(), {
      onSuccess: (ws) => {
        setShowJoin(false);
        setInviteCode('');
        router.push({ pathname: '/(tabs)/more/collab/[id]', params: { id: String(ws.id) } });
      },
      onError: () => Alert.alert('Invalid Code', 'Could not join workspace. Check the code and try again.'),
    });
  };

  return (
    <Screen safeArea={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Workspaces</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Collaborate with your team</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
            <TouchableOpacity onPress={() => { setShowCreate(!showCreate); setShowJoin(false); }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: colors.primary, borderRadius: RADIUS.lg, padding: SPACING.md }}>
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowJoin(!showJoin); setShowCreate(false); }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="enter-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Join</Text>
            </TouchableOpacity>
          </View>

          {/* Create Form */}
          {showCreate && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.md }}>New Workspace</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder="Workspace name" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm }} />
              <TextInput value={newSubject} onChangeText={setNewSubject} placeholder="Subject (optional)" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.md }} />
              <Button title={createWorkspace.isPending ? 'Creating...' : 'Create Workspace'} variant="primary" onPress={handleCreate} disabled={!newName.trim() || createWorkspace.isPending} />
            </View>
          )}

          {/* Join Form */}
          {showJoin && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.md }}>Join Workspace</Text>
              <TextInput value={inviteCode} onChangeText={setInviteCode} placeholder="Enter invite code" placeholderTextColor={colors.textSecondary} autoCapitalize="characters" style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', letterSpacing: 2, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.md, textAlign: 'center' }} />
              <Button title={joinWorkspace.isPending ? 'Joining...' : 'Join'} variant="primary" onPress={handleJoin} disabled={!inviteCode.trim() || joinWorkspace.isPending} />
            </View>
          )}

          {/* Workspace List */}
          {workspacesQuery.isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} height={60} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.sm }} />)
          ) : workspaces.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="people-outline" size={48} color={colors.textSecondary} style={{ marginBottom: SPACING.md }} />
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 4 }}>No workspaces yet</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>Create one or join with an invite code</Text>
            </View>
          ) : (
            workspaces.map((ws) => (
              <WorkspaceCard key={ws.id} ws={ws} colors={colors} onPress={() => router.push({ pathname: '/(tabs)/more/collab/[id]', params: { id: String(ws.id) } })} />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
