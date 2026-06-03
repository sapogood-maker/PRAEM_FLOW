import { api } from './api';

export const queueService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/queue', { params }).then((r) => r.data),
  create: (data: any) => api.post('/queue', data).then((r) => r.data),
  updatePriority: (id: string, priority: string) =>
    api.put(`/queue/${id}/priority`, { priority }).then((r) => r.data),
  updateConfirmation: (id: string, status: string, channel?: string) =>
    api.put(`/queue/${id}/confirmation`, { status, channel }).then((r) => r.data),
  remove: (id: string) => api.delete(`/queue/${id}`).then((r) => r.data),
  suggest: () => api.post('/dispatch/suggestions').then((r) => r.data),
};
