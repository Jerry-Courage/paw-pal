import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useEntitlements } from '@/hooks/useSubscription';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const MENU_ITEMS = [
  { icon: 'people', label: 'Workspaces', description: 'Collaborate with your team', color: '#8b5cf6', route: '/(tabs)/more/collab' },
  { icon: 'game-controller', label: 'Quiz Battle', description: 'Compete in real-time quizzes', color: '#ef4444', route: '/(tabs)/more/battle' },
  { icon: 'calendar', label: 'Planner', description: 'Study sessions & deadlines', color: '#f97316', route: '/(tabs)/more/planner' },
  { icon: 'document-text', label: 'Assignments', description: 'AI-powered assignment help', color: '#8b5cf6', route: '/(tabs)/more/assignments' },
  { icon: 'trophy', label: 'Rankings', description: 'See how you rank', color: '#eab308', route: '/(tabs)/more/rankings' },
  { icon: 'stats-chart', label: 'Progress', description: 'XP, level & study stats', color: '#22c55e', route: '/(tabs)/more/progress' },
] as const;

const SETTINGS_ITEMS = [
  { icon: 'diamond', label: 'Subscription', description: 'Manage your plan', color: '#eab308', route: '/(tabs)/more/subscription' },
  { icon: 'receipt', label: 'Payment History', description: 'View past payments', color: '#06b6d4', route: '/(tabs)/more/payment-history' },
  { icon: 'help-circle', label: 'Help & Support', description: 'Get help with FlowState', color: '#22c55e', route: null as string | null },
  { icon: 'shield', label: 'Privacy Policy', description: 'How we protect your data', color: '#8b5cf6', route: null as string | null },
  { icon: 'document', label: 'Terms of Service', description: 'Usage terms', color: '#f97316', route: null as string | null },
] as const;

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const colors = useThemeColors();
  const entitlements = useEntitlements();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <Screen scroll>
      <View style={{ marginBottom: SPACING.xxxl }}>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800' }}>More</Text>
      </View>

      <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>
              {(user?.first_name || user?.username || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700' }}>
              {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>{user?.email}</Text>
          </View>
        </View>
        {user?.university ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Ionicons name="school" size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>{user.university}</Text>
          </View>
        ) : null}
      </View>

      {!entitlements.isPremium && (
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/more/subscription' as any); }} activeOpacity={0.7} style={{ backgroundColor: '#eab308' + '15', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#eab308' + '40', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <Ionicons name="diamond" size={18} color="#eab308" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#eab308', fontSize: FONT_SIZE.sm, fontWeight: '700' }}>Upgrade to Premium</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Unlimited resources & AI</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#eab308" />
        </TouchableOpacity>
      )}

      <View style={{ backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Level</Text>
          <Text style={{ color: colors.primary, fontSize: FONT_SIZE.md, fontWeight: '800' }}>{user?.level?.rank || 'Level 1'}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>{user?.xp ?? 0} XP</Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>Next: {user?.level?.next_xp ?? 500} XP</Text>
        </View>
      </View>

      <View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(item.route as any); }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: item.color + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={item.icon as any} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>{item.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, marginTop: 2 }}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, marginLeft: SPACING.xs }}>SETTINGS</Text>
      <View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
        {SETTINGS_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (item.route) router.push(item.route as any);
              else Alert.alert(item.label, 'Coming soon');
            }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, gap: SPACING.sm }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: item.color + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={item.icon as any} size={16} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{item.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, marginBottom: SPACING.md }}>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>FlowState v1.0.0</Text>
      </View>

      <TouchableOpacity
        onPress={handleLogout}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
      >
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.md, fontWeight: '500' }}>Sign Out</Text>
      </TouchableOpacity>
    </Screen>
  );
}
