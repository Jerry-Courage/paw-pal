import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService } from '@/services/ai';
import { ChatMessage, ChatSession } from '@/types';

export function useAiChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<{ content: string; sessionId?: number; resourceId?: number } | null>(null);
  const activeSessionRef = useRef<number | null>(null);

  const sendMutation = useMutation({
    mutationFn: async (params: {
      content: string;
      sessionId?: number;
      resourceId?: number;
      contextType?: string;
      imageUrl?: string;
    }) => {
      setError(null);
      setFailedMessage(null);

      let sessionId = params.sessionId || activeSessionRef.current;

      if (!sessionId) {
        const session = await aiService.createSession({
          context_type: params.contextType || (params.resourceId ? 'resource' : 'global'),
          resource: params.resourceId,
          title: params.content.slice(0, 50),
        });
        sessionId = session.id;
        activeSessionRef.current = sessionId;
      }

      const userMsg: ChatMessage = {
        id: Date.now(),
        role: 'user',
        content: params.content,
        image: params.imageUrl || null,
        diagram: null,
        diagram_code: null,
        audio_url: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const response = await aiService.askAgent({
        query: params.content,
        context: params.resourceId ? `resource_id:${params.resourceId}` : '',
        history,
        session_id: sessionId,
        image_url: params.imageUrl,
      });

      const assistantMsg: ChatMessage = {
        id: response.message_id || Date.now() + 1,
        role: 'assistant',
        content: response.reply,
        image: null,
        diagram: response.diagram || null,
        diagram_code: response.diagram || null,
        audio_url: response.audio_url || null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsThinking(false);

      activeSessionRef.current = response.session_id;
      return { session: response.session_id, message: assistantMsg };
    },
    onError: (err: any) => {
      setIsThinking(false);
      const msg = err?.response?.data?.error || err?.message || 'Something went wrong.';
      setError(msg);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const sendMessage = useCallback(
    (content: string, sessionId?: number, resourceId?: number, imageUrl?: string) => {
      if (sendMutation.isPending) return;
      setFailedMessage(null);
      setError(null);
      sendMutation.mutate({ content, sessionId, resourceId, imageUrl });
    },
    [sendMutation]
  );

  const retryLastMessage = useCallback(() => {
    if (failedMessage) {
      sendMutation.mutate(failedMessage);
    }
  }, [failedMessage, sendMutation]);

  const loadSession = useCallback(async (sessionId: number) => {
    setError(null);
    setFailedMessage(null);
    const session = await aiService.getSession(sessionId);
    setMessages(session.messages || []);
    activeSessionRef.current = sessionId;
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
    activeSessionRef.current = null;
    setIsThinking(false);
    setError(null);
    setFailedMessage(null);
  }, []);

  return {
    messages,
    isThinking,
    error,
    sendMessage,
    loadSession,
    resetChat,
    retryLastMessage,
    isLoading: sendMutation.isPending,
    activeSessionId: activeSessionRef.current,
  };
}
