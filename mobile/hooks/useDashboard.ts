import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard';

export function useDashboard() {
  const analytics = useQuery({
    queryKey: ['analytics'],
    queryFn: () => dashboardService.getAnalytics(),
  });

  const nudge = useQuery({
    queryKey: ['nudge'],
    queryFn: () => dashboardService.getNudge(),
  });

  return { analytics, nudge };
}
