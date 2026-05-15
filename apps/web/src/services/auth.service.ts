import { api } from './api';

export const authService = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
};
