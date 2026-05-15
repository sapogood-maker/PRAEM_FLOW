import { api } from './api';

export const queueService = {
  list: () => api.get('/queue').then((r) => r.data),
  suggest: () => api.post('/queue/ai-suggest').then((r) => r.data),
};
