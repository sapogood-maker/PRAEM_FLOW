import { NotificationTemplateCategory } from '../variables/notification-template.variables';

export type NotificationTemplateMetadata = {
  category?: NotificationTemplateCategory;
  variables?: string[];
};

export type NotificationTemplateRecord = {
  id: string;
  tenantId: string;
  key: string;
  title: string;
  message: string;
  variables: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationTemplateResponse = {
  id: string;
  key: string;
  title: string;
  message: string;
  active: boolean;
  category: NotificationTemplateCategory | null;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
};

