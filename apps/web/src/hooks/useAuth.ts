'use client';

import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

export function useAuth() {
  const setToken = useAuthStore((s) => s.setToken);

  return {
    login: async ({ email, password }: { email: string; password: string }) => {
      const response = await authService.login(email, password);
      setToken(response.data.access_token);
      return response.data;
    },
  };
}
