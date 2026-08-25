import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useTheme';
import { useResources } from '@/hooks/useResources';
import { useGeneratePreview, useBuildPath } from '@/hooks/useLearningPaths';
import { SPACING, FONT_SIZE, RADIUS, TYPOGRAPHY } from '@/constants/theme';
import { Resource } from '@/types';
import { PreviewUnit } from '@/services/learning';

interface JourneyWizardProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (pathId: string) => void;
}

const DEPTH_OPTIONS = [
  { key: 'quick', label: 'Quick', desc: '5-8 concepts', time: '~20-40 min', icon: 'flash' as const },
  { key: 'standard', label: 'Standard', desc: '8-15 concepts', time: '~1-2h', icon: 'layers' as const },
  { key: 'deep', label: 'Deep', desc: '15-25 concepts', time: '~2-4h', icon: 'diamond' as const },
];

function StepIndicator({ step, total, colors }: { step: number; total: number; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            height: 3,
            flex: 1,
            borderRadius: 2,
            backgroundColor: i < step ? colors.primary : i === step ? colors.primary + '80' : colors.muted,
          }}
        />
      ))}
    </View>
  );
}

function StepGoal({ goal, setGoal, colors }: { goal: string; setGoal: (v: string) => void; colors: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[TYPOGRAPHY.heading, { color: colors.text, marginBottom: SPACING.xs }]}>
        What do you want to master?
      </Text>
      <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginBottom: SPACING.xl }]}>
        Enter a topic or learning goal.
      </Text>
      <TextInput
        value={goal}
        onChangeText={setGoal}
        placeholder="e.g. Cell Biology, MOSFETs, Database Normalization"
        placeholderTextColor={colors.textMuted}
        autoFocus
        style={{
          backgroundColor: colors.card,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: goal ? colors.primary + '60' : colors.border,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.md + 4,
          color: colors.text,
          fontSize: FONT_SIZE.lg,
          fontWeight: '500',
        }}
      />
      {goal.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm }}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={{ color: colors.success, fontSize: FONT_SIZE.xs }}>Good goal</Text>
        </View>
      )}
    </View>
  );
}

function StepResources({ selected, toggle, resources, colors }: {
  selected: Set<number>;
  toggle: (id: number) => void;
  resources: Resource[];
  colors: any;
}) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? resources : resources.filter((r) => r.resource_type === filter);

  return (
    <View style={{ flex: 1 }}>
      <Text style={[TYPOGRAPHY.heading, { color: colors.text, marginBottom: SPACING.xs }]}>
        Where should Flow learn from?
      </Text>
      <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginBottom: SPACING.lg }]}>
        Select the study materials for this journey.
      </Text>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          {['all', 'pdf', 'video', 'slides', 'code'].map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.xs + 2,
                borderRadius: RADIUS.pill,
                backgroundColor: filter === f ? colors.primary + '20' : colors.card,
                borderWidth: 1,
                borderColor: filter === f ? colors.primary + '40' : colors.border,
              }}
            >
              <Text style={{ color: filter === f ? colors.primary : colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                {f === 'all' ? 'All' : f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Resource list */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {filtered.map((r) => {
          const isSelected = selected.has(r.id);
          return (
            <TouchableOpacity
              key={r.id}
              onPress={() => toggle(r.id)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: SPACING.md,
                marginBottom: SPACING.sm,
                borderRadius: RADIUS.md,
                backgroundColor: isSelected ? colors.primary + '10' : colors.card,
                borderWidth: 1,
                borderColor: isSelected ? colors.primary + '40' : colors.border,
                gap: SPACING.md,
              }}
            >
              <View style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: isSelected ? colors.primary : colors.textMuted,
                backgroundColor: isSelected ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '500' }} numberOfLines={1}>{r.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
                  {r.resource_type.toUpperCase()}{r.subject ? ` · ${r.subject}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm }}>
        <Ionicons name="information-circle" size={14} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>
          {selected.size} resource{selected.size !== 1 ? 's' : ''} selected
        </Text>
      </View>
    </View>
  );
}

function StepDepth({ depth, setDepth, colors }: { depth: string; setDepth: (v: string) => void; colors: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[TYPOGRAPHY.heading, { color: colors.text, marginBottom: SPACING.xs }]}>
        Choose journey depth
      </Text>
      <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginBottom: SPACING.xl }]}>
        How deep should this journey go?
      </Text>
      <View style={{ gap: SPACING.md }}>
        {DEPTH_OPTIONS.map((opt) => {
          const isActive = depth === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setDepth(opt.key)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: SPACING.lg,
                borderRadius: RADIUS.lg,
                backgroundColor: isActive ? colors.primary + '12' : colors.card,
                borderWidth: 1.5,
                borderColor: isActive ? colors.primary : colors.border,
                gap: SPACING.md,
              }}
            >
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: isActive ? colors.primary + '20' : colors.muted,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name={opt.icon} size={20} color={isActive ? colors.primary : colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>{opt.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>
                  {opt.desc} · {opt.time}
                </Text>
              </View>
              {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function StepPreview({ preview, goal, depth, colors, onBuild, building }: {
  preview: PreviewUnit[];
  goal: string;
  depth: string;
  colors: any;
  onBuild: () => void;
  building: boolean;
}) {
  const totalConcepts = preview.reduce((sum, u) => sum + u.concept_count, 0);
  const totalMinutes = preview.reduce((sum, u) => sum + u.concepts.reduce((s, c) => s + c.estimated_minutes, 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  return (
    <View style={{ flex: 1 }}>
      <Text style={[TYPOGRAPHY.heading, { color: colors.text, marginBottom: SPACING.xs }]}>
        Journey Preview
      </Text>
      <Text style={[TYPOGRAPHY.bodySmall, { color: colors.textSecondary, marginBottom: SPACING.lg }]}>
        {goal} · {totalConcepts} concepts · {hours > 0 ? `${hours}h ` : ''}{mins}m
      </Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {preview.map((unit, i) => (
          <View key={i} style={{ marginBottom: SPACING.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <Text style={[TYPOGRAPHY.label, { color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                {unit.title}
              </Text>
            </View>
            {unit.concepts.map((c, j) => (
              <View
                key={j}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: SPACING.xs + 2,
                  paddingLeft: SPACING.xl + SPACING.sm,
                  gap: SPACING.sm,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted }} />
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, flex: 1 }}>{c.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{c.estimated_minutes}m</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={onBuild}
        disabled={building}
        style={{
          backgroundColor: building ? colors.primary + '60' : colors.primary,
          borderRadius: RADIUS.lg,
          paddingVertical: SPACING.md + 2,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: SPACING.sm,
          marginTop: SPACING.md,
        }}
      >
        {building ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="rocket" size={18} color="#fff" />
        )}
        <Text style={{ color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>
          {building ? 'Building...' : 'Build Journey'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function JourneyWizard({ visible, onClose, onCreated }: JourneyWizardProps) {
  const colors = useThemeColors();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  const [selectedResources, setSelectedResources] = useState<Set<number>>(new Set());
  const [depth, setDepth] = useState('standard');
  const [preview, setPreview] = useState<PreviewUnit[] | null>(null);

  const resourcesQuery = useResources();
  const resources = Array.isArray(resourcesQuery.data) ? resourcesQuery.data : [];
  const generatePreview = useGeneratePreview();
  const buildPath = useBuildPath();

  const toggleResource = useCallback((id: number) => {
    setSelectedResources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canNext = () => {
    if (step === 0) return goal.trim().length > 0;
    if (step === 1) return selectedResources.size > 0;
    if (step === 2) return true;
    if (step === 3) return preview !== null;
    return false;
  };

  const handleNext = async () => {
    if (step === 2) {
      // Generate preview
      try {
        const result = await generatePreview.mutateAsync({
          goal: goal.trim(),
          resources: Array.from(selectedResources),
          depth,
        });
        setPreview(result.units);
        setStep(3);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.error || 'Failed to generate preview');
      }
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBuild = async () => {
    try {
      const result = await buildPath.mutateAsync({
        goal: goal.trim(),
        resources: Array.from(selectedResources),
        depth,
      });
      onCreated(result.id);
      handleClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Failed to build journey');
    }
  };

  const handleClose = () => {
    setStep(0);
    setGoal('');
    setSelectedResources(new Set());
    setDepth('standard');
    setPreview(null);
    generatePreview.reset();
    buildPath.reset();
    onClose();
  };

  const handleBack = () => {
    if (step === 3) setPreview(null);
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <TouchableOpacity onPress={step > 0 ? handleBack : handleClose} style={{ padding: SPACING.xs }}>
              <Ionicons name={step > 0 ? 'chevron-back' : 'close'} size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[TYPOGRAPHY.label, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }]}>
              Step {step + 1} of 4
            </Text>
            <View style={{ width: 32 }} />
          </View>
          <StepIndicator step={step} total={4} colors={colors} />
        </View>

        {/* Content */}
        <View style={{ flex: 1, paddingHorizontal: SPACING.lg }}>
          {step === 0 && <StepGoal goal={goal} setGoal={setGoal} colors={colors} />}
          {step === 1 && (
            <StepResources
              selected={selectedResources}
              toggle={toggleResource}
              resources={resources.filter((r) => r.status === 'ready')}
              colors={colors}
            />
          )}
          {step === 2 && <StepDepth depth={depth} setDepth={setDepth} colors={colors} />}
          {step === 3 && preview && (
            <StepPreview
              preview={preview}
              goal={goal}
              depth={depth}
              colors={colors}
              onBuild={handleBuild}
              building={buildPath.isPending}
            />
          )}
        </View>

        {/* Bottom action */}
        {step < 3 && (
          <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl }}>
            <TouchableOpacity
              onPress={handleNext}
              disabled={!canNext() || generatePreview.isPending}
              style={{
                backgroundColor: !canNext() || generatePreview.isPending ? colors.primary + '40' : colors.primary,
                borderRadius: RADIUS.lg,
                paddingVertical: SPACING.md + 2,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: SPACING.sm,
              }}
            >
              {generatePreview.isPending && step === 2 ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name={step === 2 ? 'sparkles' : 'arrow-forward'} size={18} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '700' }}>
                {generatePreview.isPending && step === 2 ? 'Generating...' : step === 2 ? 'Preview Journey' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
