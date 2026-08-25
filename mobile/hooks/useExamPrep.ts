import { useState, useCallback, useRef, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'flowstate_access_token';

interface ExamPrepMessage {
  type: string;
  text?: string;
  message?: string;
  report?: {
    summary: string;
    strengths: string[];
    gaps: string[];
    score: number;
    recommendation: string;
  };
}

export function useExamPrep(resourceId: number) {
  const [phase, setPhase] = useState<'setup' | 'session' | 'report'>('setup');
  const [technique, setTechnique] = useState<string>('');
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const [report, setReport] = useState<ExamPrepMessage['report'] | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const startSession = useCallback(
    async (selectedTechnique: string, resourceTitle: string, resourceContext: string) => {
      setTechnique(selectedTechnique);
      setPhase('session');
      setTranscript([]);
      setReport(null);

      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const protocol = 'wss';
      const host = 'paw-pal-backend-0bx0.onrender.com';
      const wsUrl = `${protocol}://${host}/ws/examprep/${resourceId}/?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatusMessage('Connecting to AI...');
        ws.send(
          JSON.stringify({
            type: 'start',
            technique: selectedTechnique,
            resource_title: resourceTitle,
            resource_context: resourceContext,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data: ExamPrepMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'ready':
              setStatusMessage('Ready');
              break;
            case 'status':
              setStatusMessage(data.message || '');
              break;
            case 'transcript_user':
              setTranscript((prev) => [...prev, { role: 'user', text: data.text || '' }]);
              break;
            case 'transcript_ai':
              setTranscript((prev) => [...prev, { role: 'assistant', text: data.text || '' }]);
              break;
            case 'session_report':
              setReport(data.report || null);
              setPhase('report');
              break;
            case 'error':
              setStatusMessage(data.message || 'Connection error');
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
      };

      ws.onerror = () => {
        setIsConnected(false);
        setStatusMessage('Connection failed');
      };
    },
    [resourceId]
  );

  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text_message', text }));
    }
  }, []);

  const endSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_session' }));
    }
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    phase,
    technique,
    transcript,
    report,
    isConnected,
    statusMessage,
    startSession,
    sendTextMessage,
    endSession,
  };
}
