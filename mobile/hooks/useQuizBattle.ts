import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizBattleService } from '@/services/quizBattle';

export function useCreateBattle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { title: string; time_per_q?: number; questions?: any[] }) => quizBattleService.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['battle-history'] }),
  });
}

export function useGenerateBattle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { resource_id?: number; topic?: string; count?: number; time_per_q?: number; title?: string; difficulty?: string }) =>
      quizBattleService.generate(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['battle-history'] }),
  });
}

export function useJoinBattle() {
  return useMutation({
    mutationFn: (pin: string) => quizBattleService.join(pin),
  });
}

export function useBattleRoom(pin: string | null) {
  return useQuery({
    queryKey: ['battle-room', pin],
    queryFn: () => quizBattleService.getRoom(pin!),
    enabled: !!pin,
    refetchInterval: false,
  });
}

export function useBattleSnapshot(pin: string | null) {
  return useQuery({
    queryKey: ['battle-snapshot', pin],
    queryFn: () => quizBattleService.getSnapshot(pin!),
    enabled: !!pin,
  });
}

export function useBattleHistory() {
  return useQuery({
    queryKey: ['battle-history'],
    queryFn: () => quizBattleService.getHistory(),
  });
}
