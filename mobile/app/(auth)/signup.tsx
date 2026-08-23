import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen, Input, Button } from '@/components/ui';
import { useThemeColors } from '@/hooks/useTheme';
import { useAuth } from '@/lib/auth-context';
import { SPACING, FONT_SIZE } from '@/constants/theme';

export default function SignupScreen() {
  const colors = useThemeColors();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !username || !password || !password2) {
      setError('All fields are required');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        username: username.trim(),
        password,
        password2,
      });
      router.replace('/(tabs)');
    } catch (e: any) {
      const data = e?.response?.data;
      if (data) {
        const firstError = Object.values(data).flat().join('. ');
        setError(firstError);
      } else {
        setError(e?.message || 'Registration failed');
      }
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
              Start your learning journey
            </Text>

            <Input
              label="Username"
              placeholder="Choose a username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

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
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Input
              label="Confirm Password"
              placeholder="Confirm your password"
              value={password2}
              onChangeText={setPassword2}
              secureTextEntry
              autoCapitalize="none"
            />

            {error ? (
              <Text style={{ color: colors.error, fontSize: FONT_SIZE.sm, marginBottom: SPACING.md }}>
                {error}
              </Text>
            ) : null}

            <Button
              title="Create Account"
              onPress={handleSignup}
              loading={loading}
              fullWidth
              size="lg"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.xl }}>
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>
                Already have an account?{' '}
              </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={{ color: colors.primary, fontSize: FONT_SIZE.sm, fontWeight: '600' }}>
                    Sign In
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
