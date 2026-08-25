import { useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Notification } from '@/types';

type NotificationEvent =
  | { type: 'new_notification'; notification: Notification };

type NotificationListener = (event: NotificationEvent) => void;

export function useNotificationSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<NotificationListener>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastNotification, setLastNotification] = useState<Notification | null>(null);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = await SecureStore.getItemAsync('flowstate_access_token');
    if (!token) return;

    const wsBase = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/^http/, 'ws').replace('/api', '');
    const url = `${wsBase}/ws/notifications/?token=${token}`;

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0;
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: NotificationEvent = JSON.parse(event.data);
        if (data.type === 'new_notification') {
          setLastNotification(data.notification);
        }
        listenersRef.current.forEach((fn) => fn(data));
      } catch {}
    };

    ws.onclose = () => {
      setStatus('disconnected');
      const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
      retryCount.current += 1;
      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    retryCount.current = 0;
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  const subscribe = useCallback((fn: NotificationListener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  return { status, lastNotification, subscribe };
}
