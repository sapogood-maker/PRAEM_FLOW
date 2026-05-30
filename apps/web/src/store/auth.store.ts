import { create } from 'zustand';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
}

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  userName: string;
  tenantName: string;
  setSession: (token: string, refreshToken: string, user: AuthUser, tenantName?: string) => void;
  clearSession: () => void;
  // kept for legacy consumers
  setToken: (token: string | null) => void;
};

function loadFromStorage(): Pick<AuthState, 'token' | 'user' | 'userName' | 'tenantName'> {
  if (typeof window === 'undefined')
    return { token: null, user: null, userName: '', tenantName: '' };
  const token = localStorage.getItem('praem_access_token');
  const raw = localStorage.getItem('praem_user');
  const user: AuthUser | null = raw ? (JSON.parse(raw) as AuthUser) : null;
  return {
    token,
    user,
    userName: user?.name ?? 'Operador PRAEM',
    tenantName: localStorage.getItem('praem_tenant_name') ?? 'Prefeitura Demo',
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadFromStorage(),
  setSession: (token, refreshToken, user, tenantName) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('praem_access_token', token);
      localStorage.setItem('praem_refresh_token', refreshToken);
      localStorage.setItem('praem_user', JSON.stringify(user));
      if (tenantName) localStorage.setItem('praem_tenant_name', tenantName);
    }
    set({ token, user, userName: user.name, tenantName: tenantName ?? 'Prefeitura Demo' });
  },
  clearSession: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('praem_access_token');
      localStorage.removeItem('praem_refresh_token');
      localStorage.removeItem('praem_user');
    }
    set({ token: null, user: null, userName: '', tenantName: '' });
  },
  setToken: (token) => set({ token }),
}));

