import { useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { WorkspaceMessage } from '@/types';

type WsEvent =
  | { type: 'broadcast_chat_message'; id: number; author: any; author_name: string; author_initials: string; content: string; is_ai: boolean; pinned_resource: number | null; pinned_resource_data: any; shared_assignment: number | null; shared_assignment_data: any; audio_file: string | null; audio_data: string | null; attachment: string | null; attachment_type: string | null; parent: number | null; parent_data: any; created_at: string }
  | { type: 'broadcast_typing'; user: string; is_typing: boolean }
  | { type: 'presence_update'; user_id: number; user_name: string; status: 'online' | 'offline' }
  | { type: 'broadcast_chat_message_edit'; message: WorkspaceMessage }
  | { type: 'broadcast_chat_message_delete'; message_id: number };

type Listener = (event: WsEvent) => void;

export function useWorkspaceSocket(workspaceId: number | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('disconnected');

  const connect = useCallback(async () => {
    if (!workspaceId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = await SecureStore.getItemAsync('flowstate_access_token');
    if (!token) return;

    const wsBase = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/^http/, 'ws').replace('/api', '');
    const url = `${wsBase}/ws/workspace/${workspaceId}/?token=${token}`;

    setStatus(retryCount.current > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0;
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: WsEvent = JSON.parse(event.data);
        listenersRef.current.forEach((fn) => fn(data));
      } catch {}
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (workspaceId) {
        const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
        retryCount.current += 1;
        reconnectTimer.current = setTimeout(() => connect(), delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [workspaceId]);

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

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    send({ type: 'typing_status', is_typing: isTyping });
  }, [send]);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  return { status, send, sendTyping, subscribe, reconnect: connect };
}
