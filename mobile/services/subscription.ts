import api from './api';

export interface SubscriptionStatus {
  is_premium: boolean;
  notes_used: number;
  notes_limit: number;
  notes_remaining: number;
  at_limit: boolean;
  assignments_used: number;
  assignments_limit: number;
  assignments_remaining: number;
  assignments_at_limit: boolean;
  subscription_expires_at: string | null;
}

export interface InitializePaymentResponse {
  reference: string;
  authorization_url: string;
  access_code: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentResponse {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  plan: string;
}

export interface PromoApplyResponse {
  success: boolean;
  message: string;
  days_added?: number;
  requires_payment?: boolean;
}

export const subscriptionService = {
  async getStatus(): Promise<SubscriptionStatus> {
    const { data } = await api.get<SubscriptionStatus>('/payments/status/');
    return data;
  },

  async initializePayment(params?: {
    currency?: string;
    promo_code?: string;
    callback_url?: string;
  }): Promise<InitializePaymentResponse> {
    const { data } = await api.post<InitializePaymentResponse>('/payments/initialize/', {
      currency: params?.currency || 'GHS',
      promo_code: params?.promo_code,
      callback_url: params?.callback_url,
    });
    return data;
  },

  async verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
    const { data } = await api.get<VerifyPaymentResponse>(`/payments/verify/?reference=${reference}`);
    return data;
  },

  async applyPromoCode(code: string): Promise<PromoApplyResponse> {
    const { data } = await api.post<PromoApplyResponse>('/payments/promo/', { code });
    return data;
  },
};
