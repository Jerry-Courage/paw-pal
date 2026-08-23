import React from 'react';
import { View, Text } from 'react-native';
import { Screen, EmptyState } from '@/components/ui';

export default function AIScreen() {
  return (
    <Screen>
      <EmptyState icon="🤖" title="AI Study Assistant" description="Coming in a future phase" />
    </Screen>
  );
}
