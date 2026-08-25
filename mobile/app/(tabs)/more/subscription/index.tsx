import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Button } from '@/components/ui';
import { useEntitlements, useInitializePayment, useVerifyPayment, useRefreshSubscription } from '@/hooks/useSubscription';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const FEATURES = [
  { icon: 'document-text', label: 'Unlimited Study Kits', free: '5 free', premium: 'Unlimited', color: '#3b82f6' },
  { icon: 'mic', label: 'AI Podcasts', free: 'Limited', premium: 'Unlimited', color: '#8b5cf6' },
  { icon: 'chatbubbles', label: 'AI Tutor', free: '100 req/hr', premium: '600 req/hr', color: '#06b6d4' },
  { icon: 'school', label: 'Assignments', free: '3 free', premium: 'Unlimited', color: '#22c55e' },
  { icon: 'sparkles', label: 'Notes & Flashcards', free: 'Limited', premium: 'Unlimited', color: '#eab308' },
  { icon: 'camera', label: 'Vision AI', free: 'Limited', premium: 'Unlimited', color: '#f97316' },
  { icon: 'calculator', label: 'Math Solver', free: 'Limited', premium: 'Unlimited', color: '#ef4444' },
  { icon: 'trophy', label: 'Exam Prep', free: 'Limited', premium: 'Unlimited', color: '#a855f7' },
];

export default function SubscriptionScreen() {
  const colors = useThemeColors();
  const entitlements = useEntitlements();
  const initPayment = useInitializePayment();
  const verifyPayment = useVerifyPayment();
  const refreshSubscription = useRefreshSubscription();
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);

  const isPremium = entitlements.isPremium;
  const expiresAt = entitlements.expiresAt;

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const handleUpgrade = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await initPayment.mutateAsync({ currency: 'GHS' });
      if (result.authorization_url) {
        await Linking.openURL(result.authorization_url);
        pollPaymentStatus(result.reference);
      }
    } catch (err: any) {
      Alert.alert('Payment Error', err?.response?.data?.error || 'Failed to initialize payment. Please try again.');
    }
  };

  const pollPaymentStatus = async (reference: string) => {
    let attempts = 0;
    const maxAttempts = 12;
    const interval = 5000;

    const check = async () => {
      attempts++;
      try {
        const result = await verifyPayment.mutateAsync(reference);
        if (result.status === 'success') {
          refreshSubscription();
          Alert.alert('Welcome!', 'Your premium subscription is now active.');
          return;
        }
      } catch {}

      if (attempts < maxAttempts) {
        pollTimeoutRef.current = setTimeout(check, interval);
      }
    };

    pollTimeoutRef.current = setTimeout(check, interval);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', textAlign: 'center' }}>
            {isPremium ? 'Your Plan' : 'Upgrade'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isPremium ? '#eab308' + '18' : colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, borderWidth: 2, borderColor: isPremium ? '#eab308' : colors.border }}>
              <Ionicons name={isPremium ? 'diamond' : 'diamond-outline'} size={32} color={isPremium ? '#eab308' : colors.textSecondary} />
            </View>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: 4 }}>
              {isPremium ? 'Premium' : 'Free Plan'}
            </Text>
            {isPremium && expiresAt && (
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>
                Renews {formatDate(expiresAt)}
              </Text>
            )}
            {!isPremium && (
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>
                GHS 10.00/month for unlimited access
              </Text>
            )}
          </View>

          {isPremium && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Active Subscription</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Resources</Text>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Unlimited</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Assignments</Text>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>Unlimited</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>AI Requests</Text>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>600/hr</Text>
              </View>
            </View>
          )}

          {!isPremium && (
            <>
              <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Current Usage</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Study Kits</Text>
                  <Text style={{ color: entitlements.atResourceLimit ? '#ef4444' : colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                    {entitlements.notesUsed} / {entitlements.notesLimit}
                  </Text>
                </View>
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                  <View style={{ height: '100%', width: `${Math.min(100, (entitlements.notesUsed / entitlements.notesLimit) * 100)}%`, backgroundColor: entitlements.atResourceLimit ? '#ef4444' : colors.primary, borderRadius: 2 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Assignments</Text>
                  <Text style={{ color: entitlements.atAssignmentLimit ? '#ef4444' : colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>
                    {entitlements.assignmentsUsed} / {entitlements.assignmentsLimit}
                  </Text>
                </View>
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.min(100, (entitlements.assignmentsUsed / entitlements.assignmentsLimit) * 100)}%`, backgroundColor: entitlements.atAssignmentLimit ? '#ef4444' : colors.primary, borderRadius: 2 }} />
                </View>
              </View>

              <View style={{ marginBottom: SPACING.xl }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '700', marginBottom: SPACING.md }}>What you get with Premium</Text>
                {FEATURES.map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: colors.border + '20' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: f.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={f.icon as any} size={16} color={f.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>{f.label}</Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 10, textDecorationLine: 'line-through', marginRight: 4 }}>{f.free}</Text>
                    <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '700' }}>{f.premium}</Text>
                  </View>
                ))}
              </View>

              <Button
                title={initPayment.isPending ? 'Starting checkout...' : 'Upgrade to Premium — GHS 10/mo'}
                onPress={handleUpgrade}
                disabled={initPayment.isPending}
                style={{ backgroundColor: '#eab308', marginBottom: SPACING.sm }}
              />
            </>
          )}

          {isPremium && (
            <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Premium Benefits</Text>
              {FEATURES.map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 6 }}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.xs, flex: 1 }}>{f.label}</Text>
                  <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '600' }}>{f.premium}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}
