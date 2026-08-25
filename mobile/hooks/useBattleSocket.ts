import { useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

export type BattleWsEvent =
  | { type: 'player_joined'; players: any[]; username: string }
  | { type: 'player_left'; username: string; players: any[] }
  | { type: 'player_ready'; players: any[]; username: string }
  | { type: 'game_countdown'; count: number }
  | { type: 'show_question'; idx: number; total: number; id: number; text: string; opt_a: string; opt_b: string; opt_c: string; opt_d: string; time_limit: number }
  | { type: 'timer_tick'; remaining: number }
  | { type: 'answer_reaction'; reaction_type: string; username: string; emoji?: string; answered?: number; total?: number }
  | { type: 'round_result'; correct: string; explanation: string; results: any[]; leaderboard: any[] }
  | { type: 'game_over'; leaderboard: any[]; xp_awards: Record<string, number> | any[] }
  | { type: 'chat_message'; username: string; message: string }
  | { type: 'rematch_request'; username: string }
  | { type: 'rematch_start'; players: any[] }
  | { type: 'error'; msg: string };

type BattleListener = (event: BattleWsEvent) => void;

export function useBattleSocket(pin: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<BattleListener>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const gameOverRef = useRef(false);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('disconnected');

  const connect = useCallback(async () => {
    if (!pin) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    gameOverRef.current = false;
    const token = await SecureStore.getItemAsync('flowstate_access_token');
    if (!token) return;

    const wsBase = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/^http/, 'ws').replace('/api', '');
    const url = `${wsBase}/ws/quiz/${pin}/?token=${token}`;

    setStatus(retryCount.current > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0;
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: BattleWsEvent = JSON.parse(event.data);
        if ((data as any).type === 'game_over') gameOverRef.current = true;
        listenersRef.current.forEach((fn) => fn(data));
      } catch {}
    };

    ws.onclose = (event) => {
      setStatus('disconnected');
      if (pin && !gameOverRef.current) {
        const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
        retryCount.current += 1;
        reconnectTimer.current = setTimeout(() => connect(), delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [pin]);

  const disconnect = useCallback(() => {
    gameOverRef.current = true;
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

  const subscribe = useCallback((fn: BattleListener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  return { status, send, subscribe, reconnect: connect };
}
