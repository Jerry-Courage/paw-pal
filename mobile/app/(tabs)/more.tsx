import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const colors = useThemeColors();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <Screen scroll>
      <View style={{ marginBottom: SPACING.xxxl }}>
        <Text style={{ color: colors.text, fontSize: FONT_SIZE.xxl, fontWeight: '800' }}>
          More
        </Text>
      </View>

      {/* ── PROFILE CARD ── */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: RADIUS.lg,
          padding: SPACING.lg,
          marginBottom: SPACING.lg,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
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

      {/* ── LEVEL INFO ── */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: RADIUS.lg,
          padding: SPACING.lg,
          marginBottom: SPACING.lg,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Level</Text>
          <Text style={{ color: colors.primary, fontSize: FONT_SIZE.md, fontWeight: '800' }}>
            {user?.level?.name || 'Level 1'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>{user?.xp ?? 0} XP</Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>
            Next: {user?.level?.next_xp ?? 500} XP
          </Text>
        </View>
      </View>

      {/* ── SIGN OUT ── */}
      <TouchableOpacity
        onPress={handleLogout}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: RADIUS.lg,
          padding: SPACING.lg,
          borderWidth: 1,
          borderColor: colors.border,
          gap: SPACING.md,
        }}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={{ color: colors.error, fontSize: FONT_SIZE.md, fontWeight: '500' }}>Sign Out</Text>
      </TouchableOpacity>
    </Screen>
  );
}
