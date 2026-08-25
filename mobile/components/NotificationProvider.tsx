import React, { useEffect, createContext, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { useAuth } from '@/lib/auth-context';
import { SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';
import { Notification } from '@/types';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface NotificationContextType {
  lastNotification: Notification | null;
}

const NotificationContext = createContext<NotificationContextType>({ lastNotification: null });

export function useNotificationContext() {
  return useContext(NotificationContext);
}

function mapLinkToRoute(link: string): string | null {
  if (!link) return null;
  if (link.startsWith('/library/')) return link;
  if (link.startsWith('/planner')) return '/(tabs)/learn/planner';
  if (link.startsWith('/workspace/')) return `/(tabs)/more/collab/${link.split('/')[2]}`;
  if (link.startsWith('/assignments')) return '/(tabs)/learn/assignments';
  return null;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { lastNotification, subscribe } = useNotificationSocket();
  const [toast, setToast] = useState<Notification | null>(null);
  const translateY = React.useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (isAuthenticated) {
      const unsub = subscribe(() => {});
      return unsub;
    }
  }, [isAuthenticated, subscribe]);

  useEffect(() => {
    if (lastNotification) {
      setToast(lastNotification);
      translateY.setValue(-100);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      const timer = setTimeout(() => {
        Animated.timing(translateY, { toValue: -100, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [lastNotification]);

  const handleToastPress = () => {
    setToast(null);
    const route = mapLinkToRoute(toast?.link || '');
    if (route) router.push(route as any);
  };

  return (
    <NotificationContext.Provider value={{ lastNotification }}>
      {children}
      {toast && (
        <Animated.View style={{ position: 'absolute', top: 60, left: SPACING.lg, right: SPACING.lg, transform: [{ translateY }], zIndex: 1000 }}>
          <TouchableOpacity onPress={handleToastPress} activeOpacity={0.9} style={{ backgroundColor: '#1a1a2e', borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: '#ffffff20', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#8b5cf6' + '30', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="notifications" size={16} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{toast.title}</Text>
              <Text style={{ color: '#ffffff80', fontSize: 10 }} numberOfLines={1}>{toast.body}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
}
