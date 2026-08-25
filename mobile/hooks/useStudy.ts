import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studyService } from '@/services/study';

export function useFlashcards(resourceId: number) {
  return useQuery({
    queryKey: ['flashcards', resourceId],
    queryFn: () => studyService.getFlashcards(resourceId),
    enabled: !!resourceId,
  });
}

export function useDueFlashcards() {
  return useQuery({
    queryKey: ['flashcards', 'due'],
    queryFn: () => studyService.getDueFlashcards(),
  });
}

export function useGenerateFlashcards() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, options }: { resourceId: number; options?: { count?: number; level?: string } }) =>
      studyService.generateFlashcards(resourceId, options),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flashcards', variables.resourceId] });
    },
  });
}

export function useReviewFlashcard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flashcardId, quality }: { flashcardId: number; quality: number }) =>
      studyService.reviewFlashcard(flashcardId, quality),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flashcards'] });
    },
  });
}

export function useQuizzes(resourceId: number) {
  return useQuery({
    queryKey: ['quizzes', resourceId],
    queryFn: () => studyService.getQuizzes(resourceId),
    enabled: !!resourceId,
  });
}

export function useGenerateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, options }: { resourceId: number; options?: { format?: string; level?: string; count?: number } }) =>
      studyService.generateQuiz(resourceId, options),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', variables.resourceId] });
    },
  });
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, answers }: { quizId: number; answers: Array<{ question_id: string; selected_option: string }> }) =>
      studyService.submitQuiz(quizId, answers),
  });
}

export function useCompleteStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, step, score }: { resourceId: number; step: string; score?: number }) =>
      studyService.completeStep(resourceId, step, score),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['resourceProgress', variables.resourceId] });
      queryClient.invalidateQueries({ queryKey: ['resource', variables.resourceId] });
    },
  });
}

export function useLogStudy() {
  return useMutation({
    mutationFn: (minutes: number) => studyService.logStudy(minutes),
  });
}
