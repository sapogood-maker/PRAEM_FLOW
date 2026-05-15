import { api } from './api';

export const routeService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/routes', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/routes/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/routes', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/routes/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/routes/${id}`).then((r) => r.data),
  optimize: (id: string) => api.post(`/routes/${id}/optimize`).then((r) => r.data),
};

