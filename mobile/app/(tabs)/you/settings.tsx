import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FlowCard } from '@/components/flow';
import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

export default function SettingsScreen() {
  const { user, logout, refreshUser } = useAuth();
  const colors = useThemeColors();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [university, setUniversity] = useState(user?.university || '');

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleExportData = () => {
    Alert.alert('Export Data', 'Your data export will be emailed to you within 24 hours.', [
      { text: 'OK' },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {} },
      ]
    );
  };

  const handleComingSoon = (feature: string) => {
    Alert.alert(feature, 'Coming soon');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
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
            <Text style={{ color: colors.text, fontSize: FONT_SIZE.xl, fontWeight: '800' }}>Settings</Text>
          </View>
        </View>

        {/* Profile Section */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, marginLeft: SPACING.xs }}>PROFILE</Text>
          <FlowCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
              <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '600' }}>Profile Information</Text>
              <TouchableOpacity onPress={() => setEditingName(!editingName)}>
                <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>{editingName ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>
            </View>

            {editingName ? (
              <View style={{ gap: SPACING.sm }}>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={colors.textSecondary}
                  style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }}
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor={colors.textSecondary}
                  style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }}
                />
                <TextInput
                  value={university}
                  onChangeText={setUniversity}
                  placeholder="University"
                  placeholderTextColor={colors.textSecondary}
                  style={{ backgroundColor: colors.background, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: colors.text, fontSize: FONT_SIZE.sm, borderWidth: 1, borderColor: colors.border }}
                />
              </View>
            ) : (
              <View style={{ gap: SPACING.md }}>
                <View>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Name</Text>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, marginTop: 2 }}>
                    {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Not set'}
                  </Text>
                </View>
                <View>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Email</Text>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, marginTop: 2 }}>{user?.email}</Text>
                </View>
                <View>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>University</Text>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, marginTop: 2 }}>{user?.university || 'Not set'}</Text>
                </View>
              </View>
            )}
          </FlowCard>
        </View>

        {/* Account Section */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, marginLeft: SPACING.xs }}>ACCOUNT</Text>
          <View style={{ gap: SPACING.sm }}>
            <TouchableOpacity
              onPress={() => handleComingSoon('Change Password')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#8b5cf618', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="lock-closed" size={16} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Change Password</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Update your password</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleExportData}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06b6d418', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="download" size={16} color="#06b6d4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Export Data</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Download your data</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#ef444418', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash" size={16} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Delete Account</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Permanently delete your account</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferences Section */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, marginLeft: SPACING.xs }}>PREFERENCES</Text>
          <FlowCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#22c55e18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="notifications" size={16} color="#22c55e" />
                </View>
                <View>
                  <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Notifications</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Push notifications</Text>
                </View>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: colors.muted, true: colors.primary + '40' }}
                thumbColor={notificationsEnabled ? colors.primary : colors.textSecondary}
              />
            </View>
          </FlowCard>
        </View>

        {/* Support Section */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, marginLeft: SPACING.xs }}>SUPPORT</Text>
          <View style={{ gap: SPACING.sm }}>
            <TouchableOpacity
              onPress={() => handleComingSoon('Help & Support')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#22c55e18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="help-circle" size={16} color="#22c55e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Help & Support</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Get help with FlowState</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleComingSoon('Privacy Policy')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#8b5cf618', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield" size={16} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Privacy Policy</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>How we protect your data</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleComingSoon('Terms of Service')}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f9731618', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="document" size={16} color="#f97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Terms of Service</Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs }}>Usage terms</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Section */}
        <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, marginLeft: SPACING.xs }}>APP</Text>
          <FlowCard style={{ marginBottom: SPACING.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>Version</Text>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>2.0.0</Text>
            </View>
          </FlowCard>

          <TouchableOpacity
            onPress={handleLogout}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border, gap: SPACING.md }}
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={{ color: '#ef4444', fontSize: FONT_SIZE.md, fontWeight: '500' }}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
