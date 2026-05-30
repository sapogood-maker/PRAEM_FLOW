import { api } from './api';

export const dashboardService = {
  kpis: () => api.get('/dashboard/kpis').then((r) => r.data),
};
