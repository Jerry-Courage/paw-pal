import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Skeleton } from '@/components/ui';
import { useThemeColors } from '@/hooks/useTheme';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

interface PaymentRecord {
  id: string;
  date: string;
  amount: string;
  currency: string;
  status: string;
  plan: string;
}

export default function PaymentHistoryScreen() {
  const colors = useThemeColors();

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, color: colors.text, fontSize: FONT_SIZE.lg, fontWeight: '700', textAlign: 'center' }}>Payment History</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: SPACING.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="receipt-outline" size={28} color={colors.textSecondary} />
          </View>
          <Text style={{ color: colors.text, fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.xs, textAlign: 'center' }}>Payment History</Text>
          <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, textAlign: 'center' }}>
            Your payment history will appear here once you have an active subscription.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
