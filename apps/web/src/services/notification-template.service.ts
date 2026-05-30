import { api } from './api';

export type NotificationTemplateCategory =
  | 'transport_confirmation'
  | 'operation_reminder'
  | 'boarding'
  | 'delay'
  | 'cancellation'
  | 'operation_completed';

export type NotificationTemplate = {
  id: string;
  key: string;
  title: string;
  message: string;
  active: boolean;
  category: NotificationTemplateCategory | null;
  variables: string[];
  createdAt: string;
  updatedAt: string;
};

export const notificationTemplateService = {
  metadata: () => api.get('/notification-templates/metadata').then((r) => r.data),
  list: () => api.get('/notification-templates').then((r) => r.data as NotificationTemplate[]),
  create: (data: {
    key: string;
    title: string;
    message: string;
    category: NotificationTemplateCategory;
    variables?: string[];
  }) => api.post('/notification-templates', data).then((r) => r.data),
  update: (
    id: string,
    data: Partial<{
      title: string;
      message: string;
      category: NotificationTemplateCategory;
      variables: string[];
      active: boolean;
    }>,
  ) => api.put(`/notification-templates/${id}`, data).then((r) => r.data),
  duplicate: (id: string) => api.post(`/notification-templates/${id}/duplicate`).then((r) => r.data),
  setActive: (id: string, active: boolean) =>
    api.put(`/notification-templates/${id}/active`, { active }).then((r) => r.data),
  preview: (payload: { message: string; context?: Record<string, string> }) =>
    api.post('/notification-templates/preview', payload).then((r) => r.data),
  seedDefaults: () => api.post('/notification-templates/seed-defaults').then((r) => r.data),
};

