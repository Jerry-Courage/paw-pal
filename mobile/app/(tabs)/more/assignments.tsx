import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton, Button } from '@/components/ui';
import { useAssignments, useCreateAssignment } from '@/hooks/useAssignments';
import { useEntitlements } from '@/hooks/useSubscription';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { Assignment } from '@/types';

function AssignmentCard({ assignment, colors, onPress }: { assignment: Assignment; colors: any; onPress: () => void }) {
  const statusColors: Record<string, string> = { pending: '#eab308', in_progress: '#8b5cf6', completed: '#22c55e', submitted: '#06b6d4' };
  const statusColor = statusColors[assignment.status] || '#94a3b8';
  const created = new Date(assignment.created_at);
  const timeAgo = created.toLocaleDateString();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: statusColor + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="document-text" size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={2}>{assignment.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 }}>
            <View style={{ backgroundColor: statusColor + '20', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: statusColor, fontSize: 10, fontWeight: '600' }}>{assignment.status.replace('_', ' ').toUpperCase()}</Text>
            </View>
            {assignment.subject ? <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{assignment.subject}</Text> : null}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 4 }}>{timeAgo}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

export default function AssignmentsScreen() {
  const colors = useThemeColors();
  const { canCreateAssignment } = useEntitlements();
  const assignmentsQuery = useAssignments();
  const createAssignment = useCreateAssignment();
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [pickedFile, setPickedFile] = useState<{ name: string; uri: string; mimeType?: string } | null>(null);

  const assignments = assignmentsQuery.data || [];
  const pending = assignments.filter((a) => a.status === 'pending');
  const processing = assignments.filter((a) => a.status === 'processing');
  const completed = assignments.filter((a) => a.status === 'completed');
  const errored = assignments.filter((a) => a.status === 'error');

  const onRefresh = async () => {
    setRefreshing(true);
    await assignmentsQuery.refetch();
    setRefreshing(false);
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        setPickedFile({ name: result.assets[0].name, uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
      }
    } catch { }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPickedFile({ name: 'photo.jpg', uri: result.assets[0].uri, mimeType: 'image/jpeg' });
    }
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    const fd = new FormData();
    fd.append('title', title.trim());
    if (description.trim()) fd.append('description', description.trim());
    if (subject.trim()) fd.append('subject', subject.trim());
    if (pickedFile) {
      fd.append('file', { uri: pickedFile.uri, name: pickedFile.name, type: pickedFile.mimeType || 'application/octet-stream' } as any);
    }
    createAssignment.mutate(fd as any, {
      onSuccess: () => { setShowCreate(false); setTitle(''); setDescription(''); setSubject(''); setPickedFile(null); },
    });
  };

  const sections = [
    { title: 'Pending', data: pending, icon: 'time' },
    { title: 'Processing', data: processing, icon: 'sync' },
    { title: 'Completed', data: completed, icon: 'checkmark-circle' },
    { title: 'Failed', data: errored, icon: 'alert-circle' },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen safeArea={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Assignments</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>AI-powered assignment help</Text>
            </View>
            <TouchableOpacity onPress={() => {
              if (!showCreate && !canCreateAssignment) {
                Alert.alert('Free limit reached', 'You\'ve reached your free assignment limit. Upgrade for unlimited access.', [
                  { text: 'View Plans', onPress: () => router.push('/(tabs)/more/subscription' as any) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
                return;
              }
              setShowCreate(!showCreate);
            }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={showCreate ? 'close' : 'add'} size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: SPACING.lg }}>
            {/* Create Form */}
            {showCreate && (
              <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.md }}>New Assignment</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="Assignment title" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm }} />
                <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor={colors.textSecondary} multiline numberOfLines={3} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm, textAlignVertical: 'top' }} />
                <TextInput value={subject} onChangeText={setSubject} placeholder="Subject (optional)" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm }} />
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
                  <TouchableOpacity onPress={handlePickFile} style={{ flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
                    <Ionicons name="attach" size={16} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>File</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handlePickImage} style={{ flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
                    <Ionicons name="image" size={16} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>Photo</Text>
                  </TouchableOpacity>
                </View>
                {pickedFile && <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: SPACING.sm }}>📎 {pickedFile.name}</Text>}
                <Button title={createAssignment.isPending ? 'Creating...' : 'Create Assignment'} variant="primary" onPress={handleCreate} disabled={!title.trim() || createAssignment.isPending} />
              </View>
            )}

            {/* Sections */}
            {assignmentsQuery.isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} height={60} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.sm }} />)
            ) : assignments.length === 0 ? (
              <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} style={{ marginBottom: SPACING.md }} />
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 4 }}>No assignments yet</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>Create your first assignment or upload a file</Text>
              </View>
            ) : (
              sections.map((section) => (
                <View key={section.title} style={{ marginBottom: SPACING.lg }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                    <Ionicons name={section.icon as any} size={16} color={colors.textSecondary} />
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>{section.title}</Text>
                    <View style={{ backgroundColor: colors.border, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>{section.data.length}</Text>
                    </View>
                  </View>
                  {section.data.map((a) => (
                    <AssignmentCard key={a.id} assignment={a} colors={colors} onPress={() => router.push({ pathname: '/(tabs)/more/[id]', params: { id: String(a.id) } })} />
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
