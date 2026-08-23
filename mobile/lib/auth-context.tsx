import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User } from '@/types';
import { authService } from '@/services/auth';
import { getAccessToken, clearTokens } from '@/services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    username: string;
    password: string;
    password2: string;
    first_name?: string;
    last_name?: string;
    university?: string;
    education_level?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authService.getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await getAccessToken();
        if (token) {
          await refreshUser();
        }
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authService.login(email, password);
    const me = await authService.getMe();
    setUser(me);
  }, []);

  const register = useCallback(async (payload: {
    email: string;
    username: string;
    password: string;
    password2: string;
    first_name?: string;
    last_name?: string;
    university?: string;
    education_level?: string;
  }) => {
    await authService.register(payload);
    const me = await authService.getMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
