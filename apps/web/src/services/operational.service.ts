import { api } from './api';

export const patientService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/patients', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/patients', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/patients/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/patients/${id}`).then((r) => r.data),
  /** Returns (or re-generates) the secure QR token for a patient */
  qr: (id: string) => api.get(`/patients/${id}/qr`).then((r) => r.data),
  /** Validates a QR token scan — returns safe operational data, never CPF */
  validateQr: (payload: { qrToken: string; vehicleId?: string; checkpoint?: string }) =>
    api.post('/patients/qr/validate', payload).then((r) => r.data),
  /** Returns QR scan history (audit log) for a patient */
  qrLogs: (id: string) => api.get(`/patients/${id}/qr/logs`).then((r) => r.data),
  /** Deactivates the current QR token */
  revokeQr: (id: string) => api.post(`/patients/${id}/qr/revoke`).then((r) => r.data),
};

export const vehicleService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/vehicles', { params }).then((r) => r.data),
  create: (data: any) => api.post('/vehicles', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/vehicles/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/vehicles/${id}`).then((r) => r.data),
};

export const driverService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/drivers', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/drivers/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/drivers', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/drivers/${id}`, data).then((r) => r.data),
  resetPassword: (id: string, password: string) =>
    api.put(`/drivers/${id}/reset-password`, { password }).then((r) => r.data),
  setActive: (id: string, active: boolean) =>
    api.put(`/drivers/${id}/active`, { active }).then((r) => r.data),
  online: () => api.get('/drivers/online').then((r) => r.data),
};

export const routeService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/routes', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/routes/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/routes', data).then((r) => r.data),
  dispatchOperation: (data: {
    queueIds: string[];
    driverId?: string;
    vehicleId?: string;
    locationId?: string;
    origin?: string;
    destination?: string;
    dispatchType?: 'IMMEDIATE' | 'SCHEDULED';
    scheduledAt?: string;
    date?: string;
    sendPatientNotifications?: boolean;
    sendBoardingQr?: boolean;
  }) => api.post('/routes/dispatch-operation', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/routes/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/routes/${id}`).then((r) => r.data),
  getTimeline: (id: string) => api.get(`/routes/${id}/timeline`).then((r) => r.data),
  startRoute: (id: string, body?: { tripId?: string; source?: string }) =>
    api.post(`/routes/${id}/start`, body ?? {}).then((r) => r.data),
  completeRoute: (id: string) => api.post(`/routes/${id}/complete`, {}).then((r) => r.data),
};

export const trackingService = {
  replay: (routeId: string, maxPoints = 3000) =>
    api.get('/tracking/replay', { params: { routeId, maxPoints } }).then((r) => r.data),
};

export const healthcareLocationService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/healthcare-locations', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/healthcare-locations/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/healthcare-locations', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/healthcare-locations/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/healthcare-locations/${id}`).then((r) => r.data),
  bySpecialty: (specialty: string) =>
    api.get(`/healthcare-locations/by-specialty/${encodeURIComponent(specialty)}`).then((r) => r.data),
};

export const schedulingImportService = {
  upload: (file: File, options?: {
    mode?: 'PREVIEW' | 'APPLY';
    autoAssignVehicles?: boolean;
    defaultDispatchType?: 'SCHEDULED' | 'IMMEDIATE';
    defaultOrigin?: string;
  }) => {
    const form = new FormData();
    form.append('file', file);
    if (options?.mode) form.append('mode', options.mode);
    if (options?.autoAssignVehicles != null) form.append('autoAssignVehicles', String(options.autoAssignVehicles));
    if (options?.defaultDispatchType) form.append('defaultDispatchType', options.defaultDispatchType);
    if (options?.defaultOrigin) form.append('defaultOrigin', options.defaultOrigin);
    return api.post('/scheduling-import/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};
