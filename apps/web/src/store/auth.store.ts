import { create } from 'zustand';

type AuthState = {
  token: string | null;
  userName: string;
  tenantName: string;
  setToken: (token: string | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userName: 'Operador PRAEM',
  tenantName: 'Prefeitura Demo',
  setToken: (token) => set({ token }),
}));
