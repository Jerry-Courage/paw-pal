import { useMutation, useQuery } from '@tanstack/react-query';
import { podcastService } from '@/services/podcast';

export function usePodcastStatus(sessionId: number | null) {
  return useQuery({
    queryKey: ['podcast-status', sessionId],
    queryFn: () => podcastService.getPodcastStatus(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'ready' || data?.status === 'error') return false;
      return 2000;
    },
  });
}

export function useCheckExistingPodcast(resourceId: number | null) {
  return useQuery({
    queryKey: ['podcast-check', resourceId],
    queryFn: () => podcastService.checkExistingPodcast(resourceId!),
    enabled: !!resourceId,
  });
}

export function useInitPodcast() {
  return useMutation({
    mutationFn: ({ resourceId, voiceA, voiceB }: { resourceId: number; voiceA?: string; voiceB?: string }) =>
      podcastService.initPodcast(resourceId, voiceA, voiceB),
  });
}

export function useInterruptPodcast() {
  return useMutation({
    mutationFn: ({ sessionId, audioBlob, currentIndex }: { sessionId: number; audioBlob: Blob; currentIndex: number }) =>
      podcastService.interruptPodcast(sessionId, audioBlob, currentIndex),
  });
}
