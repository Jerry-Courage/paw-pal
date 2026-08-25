import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learningService, PreviewResponse, BuildResponse } from '@/services/learning';

export function useLearningPaths() {
  return useQuery({
    queryKey: ['learningPaths'],
    queryFn: () => learningService.getPaths(),
  });
}

export function useLearningPath(id: string) {
  return useQuery({
    queryKey: ['learningPath', id],
    queryFn: () => learningService.getPath(id),
    enabled: !!id,
  });
}

export function useCreateLearningPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { title: string; description?: string; subject?: string; start_date?: string; deadline?: string }) =>
      learningService.createPath(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPaths'] });
    },
  });
}

export function useDeleteLearningPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningService.deletePath(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPaths'] });
    },
  });
}

export function useGeneratePreview() {
  return useMutation({
    mutationFn: (params: { goal: string; resources: number[]; depth: string }) =>
      learningService.generatePreview(params),
  });
}

export function useBuildPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { goal: string; title?: string; resources: number[]; depth: string }) =>
      learningService.buildPath(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPaths'] });
    },
  });
}

export function useCondensePath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, depth }: { id: string; depth?: string }) =>
      learningService.condensePath(id, depth),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPaths'] });
      queryClient.invalidateQueries({ queryKey: ['learningPath'] });
    },
  });
}

export function useRoadmap(id: string) {
  return useQuery({
    queryKey: ['roadmap', id],
    queryFn: () => learningService.getRoadmap(id),
    enabled: !!id,
  });
}

export function usePathAnalytics(id: string) {
  return useQuery({
    queryKey: ['pathAnalytics', id],
    queryFn: () => learningService.getAnalytics(id),
    enabled: !!id,
  });
}

export function useDueReviews(id: string) {
  return useQuery({
    queryKey: ['dueReviews', id],
    queryFn: () => learningService.getDueReviews(id),
    enabled: !!id,
  });
}

export function useCompleteConcept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score }: { id: string; score?: number }) =>
      learningService.completeConcept(id, score),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learningPath'] });
      queryClient.invalidateQueries({ queryKey: ['learningPaths'] });
      queryClient.invalidateQueries({ queryKey: ['roadmap'] });
    },
  });
}

export function useReviewConcept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score }: { id: string; score: number }) =>
      learningService.reviewConcept(id, score),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPath'] });
      queryClient.invalidateQueries({ queryKey: ['dueReviews'] });
    },
  });
}

// Legacy alias
export const useGenerateConcepts = useBuildPath;
