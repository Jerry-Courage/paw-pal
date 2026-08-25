import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionService, SubscriptionStatus } from '@/services/subscription';

const SUBSCRIPTION_KEY = ['subscription-status'];

export function useSubscriptionStatus() {
  return useQuery({
    queryKey: SUBSCRIPTION_KEY,
    queryFn: subscriptionService.getStatus,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useEntitlements() {
  const { data, isLoading, error } = useSubscriptionStatus();

  const isPremium = data?.is_premium ?? false;
  const notesUsed = data?.notes_used ?? 0;
  const notesLimit = data?.notes_limit ?? 5;
  const notesRemaining = data?.notes_remaining ?? 5;
  const atResourceLimit = data?.at_limit ?? false;
  const assignmentsUsed = data?.assignments_used ?? 0;
  const assignmentsLimit = data?.assignments_limit ?? 3;
  const assignmentsRemaining = data?.assignments_remaining ?? 3;
  const atAssignmentLimit = data?.assignments_at_limit ?? false;
  const expiresAt = data?.subscription_expires_at ?? null;

  const canCreateResource = isPremium || !atResourceLimit;
  const canCreateAssignment = isPremium || !atAssignmentLimit;

  return {
    isPremium,
    isLoading,
    error,
    notesUsed,
    notesLimit,
    notesRemaining,
    atResourceLimit,
    assignmentsUsed,
    assignmentsLimit,
    assignmentsRemaining,
    atAssignmentLimit,
    expiresAt,
    canCreateResource,
    canCreateAssignment,
  };
}

export function useInitializePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: subscriptionService.initializePayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
    },
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => subscriptionService.verifyPayment(reference),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
    },
  });
}

export function useApplyPromoCode() {
  return useMutation({
    mutationFn: (code: string) => subscriptionService.applyPromoCode(code),
  });
}

export function useRefreshSubscription() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
  };
}
