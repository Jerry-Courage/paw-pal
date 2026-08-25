import { useQuery } from '@tanstack/react-query';
import { gamificationService, ProgressionData } from '@/services/gamification';

export function useProgression() {
  return useQuery<ProgressionData>({
    queryKey: ['progression'],
    queryFn: gamificationService.getProgression,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}

export function useFlowcoinBalance() {
  const { data, ...rest } = useProgression();
  return {
    balance: data?.flowcoins ?? 0,
    ...rest,
  };
}
