import { api } from './api';

export const patientService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/patients', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/patients', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/patients/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/patients/${id}`).then((r) => r.data),
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
  update: (id: string, data: any) => api.put(`/drivers/${id}`, data).then((r) => r.data),
};

export const routeService = {
  list: (params?: Record<string, string | number>) =>
    api.get('/routes', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/routes/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/routes', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/routes/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/routes/${id}`).then((r) => r.data),
};
