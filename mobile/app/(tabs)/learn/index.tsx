import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, FlatList, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FlowTabSwitcher, FlowEmptyState, FlowSkeleton } from '@/components/flow';
import JourneyWizard from '@/components/JourneyWizard';
import { useLearningPaths, useDeleteLearningPath, useCondensePath } from '@/hooks/useLearningPaths';
import { useResources } from '@/hooks/useResources';
import { useEntitlements } from '@/hooks/useSubscription';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import { LearningPathList, Resource, Assignment, StudySession } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '@/services/api';

const TABS = ['Journey', 'Library', 'Tasks'];

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pdf', label: 'PDF' },
  { key: 'video', label: 'Video' },
  { key: 'slides', label: 'Slides' },
  { key: 'code', label: 'Code' },
];

function getTypeIcon(type: string): string {
  switch (type) {
    case 'pdf': return 'document-text';
    case 'video': return 'play-circle';
    case 'slides': return 'easel';
    case 'code': return 'code-slash';
    default: return 'document';
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'pdf': return '#ef4444';
    case 'video': return '#8b5cf6';
    case 'slides': return '#f97316';
    case 'code': return '#22c55e';
    default: return '#94a3b8';
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Journey Section ───

function JourneySection() {
  const colors = useThemeColors();
  const pathsQuery = useLearningPaths();
  const deletePath = useDeleteLearningPath();
  const condensePath = useCondensePath();
  const [refreshing, setRefreshing] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const paths = pathsQuery.data || [];
  const activePaths = paths.filter((p) => p.status === 'active');
  const otherPaths = paths.filter((p) => p.status !== 'active');

  const onRefresh = async () => {
    setRefreshing(true);
    await pathsQuery.refetch();
    setRefreshing(false);
  };

  const handleDelete = (path: LearningPathList) => {
    Alert.alert('Delete Path', `Delete "${path.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePath.mutate(path.id) },
    ]);
  };

  const handleCondense = (path: LearningPathList) => {
    const isOversized = path.total_concepts > 25;
    Alert.alert(
      isOversized ? 'Condense Journey' : 'Regenerate Journey',
      isOversized
        ? `This journey has ${path.total_concepts} concepts. Condense it to a standard structure?`
        : `Regenerate "${path.title}" with a fresh structure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isOversized ? 'Condense' : 'Regenerate',
          onPress: () => condensePath.mutate({ id: path.id, depth: 'standard' }),
        },
      ]
    );
  };

  if (pathsQuery.isLoading) {
    return (
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        {[1, 2, 3].map((i) => (
          <FlowSkeleton key={i} width="100%" height={120} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.md }} />
        ))}
      </View>
    );
  }

  // Empty state
  if (paths.length === 0) {
    return (
      <View style={{ flex: 1, paddingHorizontal: SPACING.lg }}>
        <View style={{ alignItems: 'center', paddingTop: SPACING.xxxl * 1.5 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg }}>
            <Ionicons name="map" size={32} color={colors.primary} />
          </View>
          <Text style={[TYPOGRAPHY.subtitle, { color: colors.text, marginBottom: SPACING.sm, textAlign: 'center' }]}>
            Start a learning journey
          </Text>
          <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl }]}>
            Build a guided path from your study materials. Flow will organize concepts into units and track your mastery.
          </Text>
          <TouchableOpacity
            onPress={() => setShowWizard(true)}
            style={{
              backgroundColor: colors.primary,
              borderRadius: RADIUS.lg,
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.xl,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING.sm,
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>New Journey</Text>
          </TouchableOpacity>
        </View>

        <JourneyWizard visible={showWizard} onClose={() => setShowWizard(false)} onCreated={(id) => router.push(`/(tabs)/learn/${id}` as any)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header with create button */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm }}>
          <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]}>
            {paths.length} path{paths.length !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            onPress={() => setShowWizard(true)}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Active Journeys — trail-head cards */}
        {activePaths.length > 0 && (
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
            <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: SPACING.md }}>
              Active Trails
            </Text>
            {activePaths.map((path) => {
              const progress = path.mastery_percent;
              const isHot = path.due_reviews > 0;
              return (
                <TouchableOpacity
                  key={path.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(tabs)/learn/${path.id}` as any); }}
                  onLongPress={() => {
                    Alert.alert(path.title, 'Choose an action', [
                      { text: 'Condense', onPress: () => handleCondense(path) },
                      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(path) },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    backgroundColor: colors.card,
                    borderRadius: RADIUS.lg,
                    overflow: 'hidden',
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: isHot ? '#f9731630' : colors.border,
                  }}
                >
                  {/* Left progress strip */}
                  <View style={{ width: 5, backgroundColor: colors.muted }}>
                    <View style={{ height: `${progress}%`, backgroundColor: colors.primary, width: '100%' }} />
                  </View>

                  <View style={{ flex: 1, padding: SPACING.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', flex: 1 }} numberOfLines={1}>{path.title}</Text>
                      {isHot && (
                        <View style={{ backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 8 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{path.due_reviews} due</Text>
                        </View>
                      )}
                    </View>

                    {path.goal ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 8 }} numberOfLines={1}>
                        {path.goal}
                      </Text>
                    ) : null}

                    {/* Progress text */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{progress}%</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                        {path.concepts_completed}/{path.total_concepts} concepts
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 'auto', textTransform: 'capitalize' }}>
                        {path.depth}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Other Paths — muted compact trailheads */}
        {otherPaths.length > 0 && (
          <View style={{ paddingHorizontal: SPACING.lg }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: SPACING.md }}>
              Completed & Paused
            </Text>
            {otherPaths.map((path) => {
              const statusColor = path.status === 'completed' ? '#8b5cf6' : path.status === 'paused' ? '#eab308' : colors.textMuted;
              const statusIcon = path.status === 'completed' ? 'trophy' : path.status === 'paused' ? 'pause' : 'document-text';
              return (
                <TouchableOpacity
                  key={path.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(tabs)/learn/${path.id}` as any); }}
                  onLongPress={() => handleDelete(path)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.card,
                    borderRadius: RADIUS.lg,
                    overflow: 'hidden',
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {/* Status strip */}
                  <View style={{ width: 4, height: '100%', backgroundColor: statusColor }} />

                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingLeft: SPACING.md - 1, gap: SPACING.md }}>
                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: statusColor + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name={statusIcon as any} size={14} color={statusColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{path.title}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                        {path.concepts_completed}/{path.total_concepts} · {path.mastery_percent}%
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <JourneyWizard visible={showWizard} onClose={() => setShowWizard(false)} onCreated={(id) => router.push(`/(tabs)/learn/${id}` as any)} />
    </View>
  );
}

// ─── Library Section (unchanged) ───

function LibrarySection() {
  const colors = useThemeColors();
  const { canCreateResource } = useEntitlements();
  const resourcesQuery = useResources();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const resources = Array.isArray(resourcesQuery.data) ? resourcesQuery.data : [];

  const filteredResources = useMemo(() => {
    let filtered = resources;
    if (typeFilter !== 'all') {
      filtered = filtered.filter((r) => r.resource_type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) => r.title.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [resources, typeFilter, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await resourcesQuery.refetch();
    setRefreshing(false);
  }, []);

  const renderItem = useCallback(({ item }: { item: Resource }) => (
    <TouchableOpacity
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(tabs)/library/${item.id}` as any); }}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Type color strip */}
      <View style={{ width: 4, backgroundColor: getTypeColor(item.resource_type) }} />

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingLeft: SPACING.md - 1, gap: SPACING.md }}>
        <View style={{ width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: getTypeColor(item.resource_type) + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={getTypeIcon(item.resource_type) as any} size={18} color={getTypeColor(item.resource_type)} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
              {item.resource_type.toUpperCase()}
            </Text>
            {item.subject ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>·</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }} numberOfLines={1}>
                  {item.subject}
                </Text>
              </>
            ) : null}
            {item.file_size > 0 && (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>·</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
                  {formatFileSize(item.file_size)}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {item.status === 'processing' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="sync" size={12} color={colors.warning} />
              <Text style={{ color: colors.warning, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                {item.processing_progress}%
              </Text>
            </View>
          ) : item.status === 'error' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="alert-circle" size={12} color={colors.error} />
              <Text style={{ color: colors.error, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Failed</Text>
            </View>
          ) : item.has_study_kit ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
              <Text style={{ color: '#22c55e', fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Ready</Text>
            </View>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
            {formatDate(item.created_at)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  ), [colors]);

  return (
    <View style={{ flex: 1 }}>
      {/* Search */}
      <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: SPACING.md, height: 40 }}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search resources..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.sm, marginLeft: SPACING.sm }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {TYPE_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              onPress={() => setTypeFilter(filter.key)}
              style={{ marginRight: SPACING.sm, backgroundColor: typeFilter === filter.key ? colors.primary + '20' : colors.card, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: typeFilter === filter.key ? colors.primary + '40' : colors.border }}
            >
              <Text style={{ color: typeFilter === filter.key ? colors.primary : colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
          {filteredResources.length} resource{filteredResources.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {resourcesQuery.isLoading ? (
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {[1, 2, 3, 4].map((i) => (
            <FlowSkeleton key={i} width="100%" height={64} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.sm }} />
          ))}
        </View>
      ) : filteredResources.length === 0 ? (
        <FlowEmptyState
          icon={<Ionicons name="library-outline" size={32} color={colors.primary} />}
          title={search ? 'No results' : 'No resources yet'}
          description={search ? 'Try a different search term' : 'Upload your first study material to get started'}
        />
      ) : (
        <FlatList
          data={filteredResources}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: SPACING.lg }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}

      <TouchableOpacity
        onPress={() => {
          if (!canCreateResource) {
            Alert.alert('Free limit reached', "You've reached your free resource limit. Upgrade for unlimited access.", [
              { text: 'View Plans', onPress: () => router.push('/(tabs)/more/subscription' as any) },
              { text: 'Cancel', style: 'cancel' },
            ]);
            return;
          }
          router.push('/(tabs)/library' as any);
        }}
        style={{ position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 }}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Tasks Section (unchanged) ───

interface TaskItem {
  id: string;
  title: string;
  due_date: string | null;
  type: 'assignment' | 'session';
  status: string;
  subject: string;
  raw: Assignment | StudySession;
}

function groupTasks(tasks: TaskItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDays = new Date(today.getTime() + 7 * 86400000);

  const groups: { today: TaskItem[]; dueSoon: TaskItem[]; upcoming: TaskItem[]; completed: TaskItem[] } = {
    today: [],
    dueSoon: [],
    upcoming: [],
    completed: [],
  };

  for (const task of tasks) {
    if (task.status === 'completed') {
      groups.completed.push(task);
      continue;
    }
    if (!task.due_date) {
      groups.upcoming.push(task);
      continue;
    }
    const due = new Date(task.due_date);
    if (due < today) {
      groups.today.push(task);
    } else if (due < sevenDays) {
      const isToday = due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth() && due.getDate() === today.getDate();
      if (isToday) {
        groups.today.push(task);
      } else {
        groups.dueSoon.push(task);
      }
    } else {
      groups.upcoming.push(task);
    }
  }

  return groups;
}

function TasksSection() {
  const colors = useThemeColors();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [assignRes, sessionRes] = await Promise.all([
        api.get('/assignments/').catch(() => ({ data: [] })),
        api.get('/planner/sessions/').catch(() => ({ data: [] })),
      ]);
      setAssignments(Array.isArray(assignRes.data) ? assignRes.data : assignRes.data?.results || []);
      setSessions(Array.isArray(sessionRes.data) ? sessionRes.data : sessionRes.data?.results || []);
    } catch {
      // silently handle errors
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const tasks: TaskItem[] = useMemo(() => {
    const assignmentTasks: TaskItem[] = assignments.map((a) => ({
      id: `a-${a.id}`,
      title: a.title,
      due_date: a.due_date || a.deadline_date,
      type: 'assignment' as const,
      status: a.status === 'completed' ? 'completed' : 'pending',
      subject: a.subject,
      raw: a,
    }));
    const sessionTasks: TaskItem[] = sessions.map((s) => ({
      id: `s-${s.id}`,
      title: s.title,
      due_date: s.start_time,
      type: 'session' as const,
      status: s.status === 'completed' ? 'completed' : 'pending',
      subject: s.subject,
      raw: s,
    }));
    return [...assignmentTasks, ...sessionTasks];
  }, [assignments, sessions]);

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);

  const renderGroup = (title: string, items: TaskItem[], accentColor: string) => {
    if (items.length === 0) return null;
    return (
      <View style={{ marginBottom: SPACING.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor }} />
          <Text style={{ color: accentColor, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 }}>{title}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>({items.length})</Text>
        </View>
        {items.map((task) => (
          <TouchableOpacity
            key={task.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (task.type === 'assignment') {
                router.push('/(tabs)/more/assignments' as any);
              } else {
                router.push('/(tabs)/more/planner' as any);
              }
            }}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderRadius: RADIUS.lg,
              overflow: 'hidden',
              marginBottom: 8,
              borderWidth: 1,
              borderColor: accentColor + '20',
            }}
          >
            {/* Urgency accent strip */}
            <View style={{ width: 4, backgroundColor: accentColor }} />

            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingLeft: SPACING.md - 1, gap: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }} numberOfLines={1}>{task.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 }}>
                  <Text style={{
                    color: accentColor,
                    fontSize: 10,
                    fontWeight: '700',
                    backgroundColor: accentColor + '15',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}>
                    {task.type === 'assignment' ? 'Assignment' : 'Session'}
                  </Text>
                  {task.subject ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 10 }} numberOfLines={1}>{task.subject}</Text>
                  ) : null}
                </View>
              </View>
              {task.due_date && (
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                  {formatDate(task.due_date)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        {[1, 2, 3].map((i) => (
          <FlowSkeleton key={i} width="100%" height={64} borderRadius={RADIUS.lg} style={{ marginBottom: SPACING.sm }} />
        ))}
      </View>
    );
  }

  const hasAnyTasks = tasks.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm }}>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
        </Text>
      </View>

      {!hasAnyTasks ? (
        <FlowEmptyState
          icon={<Ionicons name="checkbox-outline" size={32} color={colors.primary} />}
          title="No tasks yet"
          description="Assignments and study sessions will appear here"
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {renderGroup('Today', grouped.today, '#f97316')}
          {renderGroup('Due Soon', grouped.dueSoon, '#eab308')}
          {renderGroup('Upcoming', grouped.upcoming, colors.textSecondary)}
          {renderGroup('Completed', grouped.completed, colors.textMuted)}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Main Learn Screen ───

export default function LearnScreen() {
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState(0);

  const renderContent = () => {
    switch (activeTab) {
      case 0: return <JourneySection />;
      case 1: return <LibrarySection />;
      case 2: return <TasksSection />;
      default: return null;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md }}>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800' }}>Learn</Text>
      </View>

      <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm }}>
        <FlowTabSwitcher tabs={TABS} activeIndex={activeTab} onChange={setActiveTab} />
      </View>

      <View style={{ flex: 1 }}>
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}
