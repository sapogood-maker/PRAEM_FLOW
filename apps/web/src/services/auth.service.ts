import { api } from './api';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; name: string; email: string; role: string; tenantId: string };
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),
  refresh: (refresh_token: string) =>
    api.post<{ access_token: string; refresh_token: string }>('/auth/refresh', { refresh_token }),
  logout: () => api.post('/auth/logout'),
};

