import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerService } from '@/services/planner';

export function usePlannerSessions(start?: string, end?: string) {
  return useQuery({
    queryKey: ['plannerSessions', start, end],
    queryFn: () => plannerService.getSessions(start, end),
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      title: string;
      subject?: string;
      session_type?: string;
      start_time: string;
      end_time: string;
      location?: string;
      notes?: string;
      resource?: number;
      assignment?: number;
    }) => plannerService.createSession(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannerSessions'] });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: number; params: Record<string, unknown> }) =>
      plannerService.updateSession(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannerSessions'] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => plannerService.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannerSessions'] });
    },
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => plannerService.completeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plannerSessions'] });
    },
  });
}

export function useDeadlines() {
  return useQuery({
    queryKey: ['deadlines'],
    queryFn: () => plannerService.getDeadlines(),
  });
}

export function useCreateDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { title: string; subject?: string; due_date: string; assignment?: number }) =>
      plannerService.createDeadline(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
    },
  });
}

export function useUpdateDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: number; params: Record<string, unknown> }) =>
      plannerService.updateDeadline(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
    },
  });
}

export function useDeleteDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => plannerService.deleteDeadline(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
    },
  });
}

export function useSmartSchedule() {
  return useQuery({
    queryKey: ['smartSchedule'],
    queryFn: () => plannerService.getSmartSchedule(),
    enabled: false,
  });
}

export function useInterpretSchedule() {
  return useMutation({
    mutationFn: (prompt: string) => plannerService.interpret(prompt),
  });
}
