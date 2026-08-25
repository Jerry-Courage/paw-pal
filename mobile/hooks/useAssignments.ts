import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentsService } from '@/services/assignments';

export function useAssignments() {
  return useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsService.getAll(),
  });
}

export function useAssignment(id: number) {
  return useQuery({
    queryKey: ['assignment', id],
    queryFn: () => assignmentsService.get(id),
    enabled: !!id,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => assignmentsService.create(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: number; params: Record<string, unknown> }) =>
      assignmentsService.update(id, params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', variables.id] });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assignmentsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useSolveAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assignmentsService.solve(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', variables] });
    },
  });
}

export function useRefineAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt }: { id: number; prompt: string }) =>
      assignmentsService.refine(id, prompt),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assignment', variables.id] });
    },
  });
}

export function useDetectAssignment() {
  return useMutation({
    mutationFn: (id: number) => assignmentsService.detect(id),
  });
}
