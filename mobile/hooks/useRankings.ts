import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { RankingsData } from '@/types';

export function useRankings() {
  return useQuery({
    queryKey: ['rankings'],
    queryFn: async (): Promise<RankingsData> => {
      const { data } = await api.get<RankingsData>('/auth/rankings/');
      return data;
    },
  });
}
