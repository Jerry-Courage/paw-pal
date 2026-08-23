import api, { saveTokens, clearTokens } from './api';
import { User, LoginResponse, RegisterResponse } from '@/types';

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login/', {
      email,
      password,
    });
    await saveTokens(data.access, data.refresh);
    return data;
  },

  async register(payload: {
    email: string;
    username: string;
    password: string;
    password2: string;
    first_name?: string;
    last_name?: string;
    university?: string;
    education_level?: string;
  }): Promise<RegisterResponse> {
    const { data } = await api.post<RegisterResponse>('/auth/register/', payload);
    await saveTokens(data.access, data.refresh);
    return data;
  },

  async logout() {
    try {
      const { default: SecureStore } = await import('expo-secure-store');
      const refreshToken = await SecureStore.getItemAsync('flowstate_refresh_token');
      if (refreshToken) {
        await api.post('/auth/logout/', { refresh: refreshToken });
      }
    } catch {
      // Logout endpoint may fail, still clear tokens
    }
    await clearTokens();
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<User>('/auth/me/');
    return data;
  },

  async updateMe(payload: Partial<Pick<User, 'username' | 'first_name' | 'last_name' | 'bio' | 'university' | 'weekly_goal_hours' | 'education_level'>>): Promise<User> {
    const { data } = await api.patch<User>('/auth/me/', payload);
    return data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password/', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};
