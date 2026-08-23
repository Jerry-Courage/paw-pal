import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen, Input, Button } from '@/components/ui';
import { useThemeColors } from '@/hooks/useTheme';
import { useAuth } from '@/lib/auth-context';
import { SPACING, FONT_SIZE } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const colors = useThemeColors();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen safeArea={false} keyboardAvoid={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ maxWidth: 400, alignSelf: 'center', width: '100%' }}>
            <Text style={{ color: colors.primary, fontSize: FONT_SIZE.xxxl, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.xs }}>
              FlowState
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.md, textAlign: 'center', marginBottom: SPACING.xxxl }}>
              Welcome back. Keep studying.
            </Text>

            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />

            <Input
              label="Password"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />

            {error ? (
              <Text style={{ color: colors.error, fontSize: FONT_SIZE.sm, marginBottom: SPACING.md }}>
                {error}
              </Text>
            ) : null}

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              fullWidth
              size="lg"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.xl }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>
                Don't have an account?{' '}
              </Text>
              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity>
                  <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
