import { useState, useCallback } from 'react';
import { aiService } from '@/services/ai';
import { MathSolution } from '@/types';

export function useMathSolver() {
  const [solution, setSolution] = useState<MathSolution | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const solve = useCallback(async (resourceId: number, problem: string, image?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiService.solveMath(resourceId, problem, image);
      setSolution(result);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to solve problem. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSolution(null);
    setError(null);
  }, []);

  return { solution, isLoading, error, solve, reset };
}
