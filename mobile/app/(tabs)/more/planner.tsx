import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton, Button } from '@/components/ui';
import { usePlannerSessions, useDeadlines, useCreateSession, useCompleteSession, useDeleteSession, useInterpretSchedule } from '@/hooks/usePlanner';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { StudySession } from '@/types';

function SessionCard({ session, colors, onComplete, onDelete }: {
  session: StudySession;
  colors: any;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const typeColors: Record<string, string> = { study: '#22c55e', class: '#8b5cf6', assignment: '#f97316', exam: '#ef4444', personal: '#06b6d4' };
  const typeColor = typeColors[session.session_type] || '#94a3b8';
  const startDate = new Date(session.start_time);
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isCompleted = session.status === 'completed';
  const isToday = new Date().toDateString() === startDate.toDateString();

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: isCompleted ? '#22c55e' + '40' : colors.border, opacity: isCompleted ? 0.6 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md }}>
        <View style={{ width: 4, height: '100%', minHeight: 40, borderRadius: 2, backgroundColor: typeColor, alignSelf: 'stretch' }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', textDecorationLine: isCompleted ? 'line-through' : 'none' }} numberOfLines={1}>{session.title}</Text>
            {session.is_ai_suggested && <Ionicons name="sparkles" size={10} color={colors.primary} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{timeStr}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>·</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{session.duration_minutes}min</Text>
            {session.subject ? <><Text style={{ color: colors.textSecondary, fontSize: 10 }}>·</Text><Text style={{ color: typeColor, fontSize: 10 }}>{session.subject}</Text></> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACING.xs }}>
          {!isCompleted && (
            <TouchableOpacity onPress={onComplete} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#22c55e' + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={14} color="#22c55e" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDelete} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#ef4444' + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trash-outline" size={14} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function PlannerScreen() {
  const colors = useThemeColors();
  const sessionsQuery = usePlannerSessions();
  const deadlinesQuery = useDeadlines();
  const createSession = useCreateSession();
  const completeSession = useCompleteSession();
  const deleteSession = useDeleteSession();
  const interpretSchedule = useInterpretSchedule();
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  const sessions = sessionsQuery.data || [];
  const deadlines = deadlinesQuery.data || [];

  const today = new Date().toDateString();
  const todaySessions = sessions.filter((s) => new Date(s.start_time).toDateString() === today && s.status !== 'completed');
  const upcomingSessions = sessions.filter((s) => new Date(s.start_time) > new Date() && s.status !== 'completed').slice(0, 10);
  const completedSessions = sessions.filter((s) => s.status === 'completed').slice(0, 5);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([sessionsQuery.refetch(), deadlinesQuery.refetch()]);
    setRefreshing(false);
  };

  const handleAiInterpret = () => {
    if (!aiPrompt.trim()) return;
    interpretSchedule.mutate(aiPrompt, {
      onSuccess: (result) => {
        const start = new Date(result.start_time);
        const end = new Date(start.getTime() + result.duration_minutes * 60000);
        createSession.mutate({
          title: result.title,
          subject: result.subject,
          session_type: result.session_type,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        }, { onSuccess: () => { setAiPrompt(''); } });
      },
      onError: () => Alert.alert('Error', 'Could not interpret schedule. Try again.'),
    });
  };

  const handleCreateManual = () => {
    if (!newTitle.trim() || !newDate || !newStart || !newEnd) return;
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = newEnd.split(':').map(Number);
    const start = new Date(newDate);
    start.setHours(sh, sm);
    const end = new Date(newDate);
    end.setHours(eh, em);
    createSession.mutate({
      title: newTitle.trim(),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    }, { onSuccess: () => { setShowCreate(false); setNewTitle(''); setNewDate(''); setNewStart(''); setNewEnd(''); } });
  };

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Planner</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>What do I need to study today?</Text>
          </View>
          <TouchableOpacity onPress={() => setShowCreate(!showCreate)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={showCreate ? 'close' : 'add'} size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          {/* AI Command */}
          <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm }}>AI SCHEDULE</Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <TextInput
                value={aiPrompt}
                onChangeText={setAiPrompt}
                placeholder="e.g. Study biology for 2 hours tomorrow"
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }}
              />
              <TouchableOpacity
                onPress={handleAiInterpret}
                disabled={!aiPrompt.trim() || interpretSchedule.isPending}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
              >
                {interpretSchedule.isPending ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="sparkles" size={16} color="#ffffff" />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Create Form */}
          {showCreate && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.md }}>New Session</Text>
              <TextInput value={newTitle} onChangeText={setNewTitle} placeholder="Title" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm }} />
              <TextInput value={newDate} onChangeText={setNewDate} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.textSecondary} style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm }} />
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <TextInput value={newStart} onChangeText={setNewStart} placeholder="Start (HH:MM)" placeholderTextColor={colors.textSecondary} style={{ flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }} />
                <TextInput value={newEnd} onChangeText={setNewEnd} placeholder="End (HH:MM)" placeholderTextColor={colors.textSecondary} style={{ flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }} />
              </View>
              <Button title={createSession.isPending ? 'Creating...' : 'Create Session'} variant="primary" onPress={handleCreateManual} disabled={!newTitle.trim() || createSession.isPending} />
            </View>
          )}

          {/* Today's Sessions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>Today</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>{todaySessions.length} session{todaySessions.length !== 1 ? 's' : ''}</Text>
          </View>
          {sessionsQuery.isLoading ? (
            [1, 2].map((i) => <Skeleton key={i} height={60} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.sm }} />)
          ) : todaySessions.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={32} color="#22c55e" style={{ marginBottom: SPACING.sm }} />
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>No sessions today. Plan some study time!</Text>
            </View>
          ) : (
            todaySessions.map((s) => (
              <SessionCard key={s.id} session={s} colors={colors} onComplete={() => completeSession.mutate(s.id)} onDelete={() => Alert.alert('Delete', 'Delete this session?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteSession.mutate(s.id) }])} />
            ))
          )}

          {/* Upcoming Deadlines */}
          {deadlines.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginTop: SPACING.lg, marginBottom: SPACING.md }}>Upcoming Deadlines</Text>
              {deadlines.slice(0, 5).map((d) => (
                <View key={d.id} style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: (d.days_until <= 3 ? '#ef4444' : d.days_until <= 7 ? '#eab308' : '#22c55e') + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: d.days_until <= 3 ? '#ef4444' : d.days_until <= 7 ? '#eab308' : '#22c55e', fontSize: 12, fontWeight: '700' }}>{d.days_until}d</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{d.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{d.subject || 'No subject'}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Upcoming Sessions */}
          {upcomingSessions.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginTop: SPACING.lg, marginBottom: SPACING.md }}>Upcoming</Text>
              {upcomingSessions.map((s) => (
                <SessionCard key={s.id} session={s} colors={colors} onComplete={() => completeSession.mutate(s.id)} onDelete={() => deleteSession.mutate(s.id)} />
              ))}
            </>
          )}

          {/* Completed */}
          {completedSessions.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginTop: SPACING.lg, marginBottom: SPACING.md }}>Completed</Text>
              {completedSessions.map((s) => (
                <SessionCard key={s.id} session={s} colors={colors} onComplete={() => {}} onDelete={() => {}} />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
