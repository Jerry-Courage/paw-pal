import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService } from '@/services/ai';
import { ChatSession } from '@/types';

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => aiService.getSessions(),
  });
}

export function useConversation(id: number) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => aiService.getSession(id),
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { context_type?: string; resource?: number; title?: string }) =>
      aiService.createSession(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => aiService.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
