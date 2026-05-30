'use client';

import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const { setSession, clearSession } = useAuthStore();
  const router = useRouter();

  return {
    login: async ({ email, password }: { email: string; password: string }) => {
      const response = await authService.login(email, password);
      const { access_token, refresh_token, user, tenantName } = response.data;
      setSession(access_token, refresh_token, user, tenantName);
      return response.data;
    },
    logout: async () => {
      try { await authService.logout(); } catch { /* ignore */ }
      clearSession();
      router.push('/login');
    },
  };
}

