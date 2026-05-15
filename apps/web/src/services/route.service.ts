import { api } from './api';

export const routeService = {
  list: () => api.get('/routes').then((r) => r.data),
};
