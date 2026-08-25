import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Skeleton } from '@/components/ui';
import JourneyNode from '@/components/JourneyNode';
import ActivitySheet from '@/components/ActivitySheet';
import { useLearningPath, usePathAnalytics, useDeleteLearningPath, useCondensePath } from '@/hooks/useLearningPaths';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import { ConceptNode, Unit } from '@/types';

export default function LearningPathDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const pathQuery = useLearningPath(id!);
  const analyticsQuery = usePathAnalytics(id!);
  const deletePath = useDeleteLearningPath();
  const condensePath = useCondensePath();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptNode | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const path = pathQuery.data;
  const analytics = analyticsQuery.data;
  const concepts = path?.concepts || [];
  const units = path?.units || [];

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([pathQuery.refetch(), analyticsQuery.refetch()]);
    setRefreshing(false);
  };

  if (pathQuery.isLoading) {
    return (
      <Screen>
        <View style={{ paddingTop: SPACING.lg, paddingHorizontal: SPACING.lg }}>
          <Skeleton width={40} height={40} borderRadius={20} style={{ marginBottom: SPACING.lg }} />
          <Skeleton width="70%" height={24} style={{ marginBottom: SPACING.sm }} />
          <Skeleton width="40%" height={14} style={{ marginBottom: SPACING.xl }} />
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, paddingLeft: SPACING.xs }}>
              <Skeleton width={36} height={36} borderRadius={18} />
              <View style={{ marginLeft: SPACING.sm, flex: 1 }}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="40%" height={10} style={{ marginTop: 4 }} />
              </View>
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  if (!path) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl * 2 }}>
          <Text style={[TYPOGRAPHY.subtitle, { color: colors.text }]}>Path not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.md }}>
            <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const handleConceptPress = (concept: ConceptNode) => {
    if (concept.status === 'locked') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedConcept(concept);
    setSheetVisible(true);
  };

  const handleStart = (conceptId: string) => {
    setSheetVisible(false);
    router.push({ pathname: '/(tabs)/learn/concept/[id]', params: { id: conceptId } } as any);
  };

  const handleReview = (conceptId: string) => {
    setSheetVisible(false);
    router.push({ pathname: '/(tabs)/learn/concept/[id]', params: { id: conceptId } } as any);
  };

  const currentConcept = concepts.find((c) => c.status === 'current');
  const completedCount = concepts.filter((c) => c.status === 'completed').length;

  // Group concepts by unit
  const conceptsByUnit = new Map<string, ConceptNode[]>();
  for (const c of concepts) {
    const unitId = c.unit || '_none';
    if (!conceptsByUnit.has(unitId)) conceptsByUnit.set(unitId, []);
    conceptsByUnit.get(unitId)!.push(c);
  }

  // Build ordered unit list
  const orderedUnits: Array<{ unit: Unit | null; concepts: ConceptNode[] }> = [];
  for (const unit of units) {
    const unitConcepts = conceptsByUnit.get(unit.id) || [];
    if (unitConcepts.length > 0) {
      orderedUnits.push({ unit, concepts: unitConcepts });
    }
  }
  // Add orphan concepts (no unit)
  const orphans = conceptsByUnit.get('_none') || [];
  if (orphans.length > 0) {
    orderedUnits.push({ unit: null, concepts: orphans });
  }

  let globalIndex = 0;

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={[TYPOGRAPHY.subtitle, { color: colors.text }]} numberOfLines={1}>{path.title}</Text>
            {path.subject ? <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]}>{path.subject}</Text> : null}
          </View>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(path.title, 'Choose an action', [
                { text: 'Condense', onPress: () => condensePath.mutate({ id: id!, depth: 'standard' }) },
                { text: 'Delete', style: 'destructive', onPress: () => { deletePath.mutate(id!); router.back(); } },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Compact progress bar */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 }}>
            <View style={{ flex: 1, height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${path.mastery_percent}%`, backgroundColor: colors.primary, borderRadius: 3 }} />
            </View>
            <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary, minWidth: 60, textAlign: 'right' }]}>
              {completedCount}/{path.total_concepts} · {path.mastery_percent}%
            </Text>
          </View>

          {/* Inline stats */}
          <View style={{ flexDirection: 'row', gap: SPACING.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="star" size={12} color={colors.xp} />
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{path.total_xp} XP</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="layers-outline" size={12} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{units.length} units</Text>
            </View>
            {path.due_reviews > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="refresh" size={12} color="#f97316" />
                <Text style={{ color: '#f97316', fontSize: 10 }}>{path.due_reviews} due</Text>
              </View>
            )}
          </View>
        </View>

        {/* Journey map */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          {orderedUnits.length === 0 && concepts.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
              <Ionicons name="bulb-outline" size={28} color={colors.textSecondary} />
              <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginTop: SPACING.sm, textAlign: 'center' }]}>
                No concepts yet. Generate them from your study materials.
              </Text>
            </View>
          ) : (
            orderedUnits.map(({ unit, concepts: unitConcepts }, unitIdx) => (
              <View key={unit?.id || `unit-${unitIdx}`} style={{ marginBottom: unitIdx < orderedUnits.length - 1 ? SPACING.sm : 0 }}>
                {unitConcepts.map((concept) => {
                  const nodeIndex = globalIndex++;
                  return (
                    <JourneyNode
                      key={concept.id}
                      id={concept.id}
                      title={concept.title}
                      status={concept.status}
                      mastery={concept.mastery}
                      difficulty={concept.difficulty}
                      estimatedMinutes={concept.estimated_minutes}
                      xpEarned={concept.xp_earned}
                      reviewsDue={concept.reviews_due}
                      index={nodeIndex}
                      isLast={nodeIndex === concepts.length - 1}
                      isUnitStart={nodeIndex === 0 || unitConcepts.indexOf(concept) === 0}
                      unitTitle={unitConcepts.indexOf(concept) === 0 ? (unit?.title || 'Path') : undefined}
                      onPress={() => handleConceptPress(concept)}
                    />
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* Analytics (compact) */}
        {analytics && (
          <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[TYPOGRAPHY.statSmall, { color: colors.text }]}>{analytics.average_mastery}%</Text>
                <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]}>Mastery</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[TYPOGRAPHY.statSmall, { color: colors.text }]}>{analytics.overall_retention}%</Text>
                <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]}>Retention</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[TYPOGRAPHY.statSmall, { color: colors.text }]}>{analytics.reviews_due}</Text>
                <Text style={[TYPOGRAPHY.caption, { color: colors.textSecondary }]}>Due</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Activity bottom sheet */}
      <ActivitySheet
        visible={sheetVisible}
        concept={selectedConcept}
        onClose={() => { setSheetVisible(false); setSelectedConcept(null); }}
        onStart={handleStart}
        onReview={handleReview}
      />
    </Screen>
  );
}
