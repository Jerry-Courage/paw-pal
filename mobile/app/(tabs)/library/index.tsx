import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Chip, FloatingActionButton, Skeleton, EmptyState } from '@/components/ui';
import { UploadSheet } from '@/components/ui/UploadSheet';
import { useResources } from '@/hooks/useResources';
import { useEntitlements } from '@/hooks/useSubscription';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { Resource } from '@/types';

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

export default function LibraryScreen() {
  const colors = useThemeColors();
  const { canCreateResource } = useEntitlements();
  const resourcesQuery = useResources();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);

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
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(tabs)/library/${item.id}` as any);
        }}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: colors.border,
        gap: SPACING.md,
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: getTypeColor(item.resource_type) + '18', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={getTypeIcon(item.resource_type) as any} size={22} color={getTypeColor(item.resource_type)} />
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
    </TouchableOpacity>
  ), [colors]);

  const renderSkeleton = () => (
    <View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.md }}>
          <Skeleton width={48} height={48} borderRadius={RADIUS.md} />
          <View style={{ flex: 1 }}>
            <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      {/* ── HEADER ── */}
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800' }}>
          My Library
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, marginTop: 2 }}>
          {resources.length} resource{resources.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* ── SEARCH ── */}
      <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: SPACING.md, height: 44 }}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search resources..."
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.sm, marginLeft: SPACING.sm }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── FILTER CHIPS ── */}
      <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TYPE_FILTERS}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              selected={typeFilter === item.key}
              onPress={() => setTypeFilter(item.key)}
              style={{ marginRight: SPACING.sm }}
            />
          )}
        />
      </View>

      {/* ── RESOURCE LIST ── */}
      {resourcesQuery.isLoading ? (
        renderSkeleton()
      ) : resourcesQuery.isError ? (
        <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2, paddingHorizontal: SPACING.xxl }}>
          <Ionicons name="cloud-offline" size={48} color={colors.error} style={{ marginBottom: SPACING.lg }} />
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.sm }}>
            Failed to load library
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.xl }}>
            Check your connection and try again
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={{ backgroundColor: colors.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full }}
          >
            <Text style={{ color: '#ffffff', fontSize: FONT_SIZE.sm, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredResources.length === 0 ? (
        <EmptyState
          icon="📚"
          title={search ? 'No results' : 'No resources yet'}
          description={search ? 'Try a different search term' : 'Upload your first study material to get started'}
        />
      ) : (
        <FlatList
          data={filteredResources}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}

      {/* ── FAB: UPLOAD ── */}
      <FloatingActionButton
        icon={<Ionicons name="add" size={28} color="#ffffff" />}
        onPress={() => {
          if (!canCreateResource) {
            Alert.alert('Free limit reached', 'You\'ve reached your free resource limit. Upgrade for unlimited access.', [
              { text: 'View Plans', onPress: () => router.push('/(tabs)/more/subscription' as any) },
              { text: 'Cancel', style: 'cancel' },
            ]);
            return;
          }
          setShowUploadSheet(true);
        }}
      />

      {/* ── UPLOAD SHEET ── */}
      <UploadSheet visible={showUploadSheet} onClose={() => setShowUploadSheet(false)} />
    </Screen>
  );
}
