'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtime.store';
import { useAuthStore } from '@/store/auth.store';
import type { VehiclePosition } from '@/types';
import { api } from '@/services/api';

export function useWebSocket(enabled = true) {
  const token = useAuthStore((s) => s.token);
  const tenantId = useAuthStore((s) => s.user?.tenantId);

  useEffect(() => {
    if (!enabled) {
      console.debug('[REACT] websocket bootstrap deferred (layout not ready)');
      return;
    }

    if (!token || !tenantId) {
      console.debug('[AUTH] websocket skipped: missing token/tenant', {
        hasToken: Boolean(token),
        tenantId: tenantId ?? null,
      });
      return;
    }

    const wsEnv = process.env.NEXT_PUBLIC_WS_URL;
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
    const resolvedWsBaseUrl = wsEnv
      ?? apiBaseUrl
      ?? (typeof window !== 'undefined' ? window.location.origin : null);

    if (!resolvedWsBaseUrl) {
      console.debug('[SOCKET] websocket skipped: no resolvable base URL', {
        NEXT_PUBLIC_WS_URL: wsEnv ?? null,
        NEXT_PUBLIC_API_URL: apiBaseUrl ?? null,
      });
      useRealtimeStore.getState().setConnected(false);
      return;
    }

    console.debug('[SOCKET] connecting /operations', {
      wsBaseUrl: resolvedWsBaseUrl,
      namespace: '/operations',
      hasToken: Boolean(token),
      tenantId,
    });
    console.debug('[AUTH] websocket init', {
      hasToken: Boolean(token),
      tenantId,
      wsBaseUrl: resolvedWsBaseUrl,
      apiBaseUrl: apiBaseUrl ?? 'not-set',
      namespace: '/operations',
    });

    const socket = io(`${resolvedWsBaseUrl}/operations`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });

    const record = (message: string, type: 'route' | 'trip' | 'queue' | 'vehicle' | 'alert' | 'boarding' = 'trip') => {
      const store = useRealtimeStore.getState();
      store.pushActivity({ message, type, timestamp: new Date().toISOString() });
      store.bumpRevision();
    };

    const extractGpsPayload = (incoming: unknown): VehiclePosition => {
      const data = (incoming ?? {}) as Record<string, unknown>;
      const nested = (data.payload ?? data.location ?? data.data ?? data) as Record<string, unknown>;
      return nested as unknown as VehiclePosition;
    };

    const dispatchGpsToStore = (event: string, incoming: unknown) => {
      const payload = extractGpsPayload(incoming);
      console.debug('[SOCKET] websocket event received', { event });
      console.debug('[GPS] payload content', { event, payload });
      useRealtimeStore.getState().updateVehiclePosition(payload);
      const markerCount = useRealtimeStore.getState().vehiclePositions.length;
      console.debug('[MAP] updateVehiclePosition called', { event, markerCount });
    };

    socket.on('connect', () => {
      useRealtimeStore.getState().setConnected(true);
      console.debug('[SOCKET] connected /operations', { tenantId });
      console.debug('[SOCKET] auth success', { tenantId, namespace: '/operations' });
      socket.emit('join:tenant', { tenantId });
      socket.emit('ops:state:request', { tenantId });
      void api.get('/tracking/live', {
        validateStatus: () => true,
      })
        .then((response) => {
          if (response.status === 401 || response.status === 403) {
            console.debug('[GPS] bootstrap tracking/live unauthorized', {
              status: response.status,
              tenantId,
            });
            return;
          }
          if (response.status >= 400) {
            console.debug('[GPS] bootstrap tracking/live non-success', {
              status: response.status,
              tenantId,
            });
            return;
          }
          const rows = Array.isArray(response.data) ? response.data : [];
          console.debug('[GPS] bootstrap tracking/live', { count: rows.length });
          for (const row of rows) {
            dispatchGpsToStore('tracking/live', row);
          }
        })
        .catch((error) => {
          console.debug('[GPS] bootstrap tracking/live failed', {
            error: String(error),
            tenantId,
          });
        });
    });
    socket.on('disconnect', () => {
      console.debug('[SOCKET] disconnected /operations', { tenantId });
      useRealtimeStore.getState().setConnected(false);
    });
    socket.on('connect_error', (error: unknown) => {
      console.debug('[SOCKET] connect_error /operations', {
        tenantId,
        error: String(error),
        wsBaseUrl: resolvedWsBaseUrl,
      });
      console.debug('[SOCKET] auth failed', { tenantId, error: String(error) });
      useRealtimeStore.getState().setConnected(false);
    });
    socket.on('error', (error: unknown) => {
      console.debug('[SOCKET] socket error /operations', { tenantId, error: String(error) });
    });

    socket.on('vehicle:tracking', (data: VehiclePosition) => {
      dispatchGpsToStore('vehicle:tracking', data);
    });

    socket.on('vehicle:position', (data: VehiclePosition) => {
      dispatchGpsToStore('vehicle:position', data);
    });

    socket.on('vehicle.location_updated', (data: VehiclePosition) => {
      dispatchGpsToStore('vehicle.location_updated', data);
    });

    socket.on('driver:location:update', (data: VehiclePosition) => {
      dispatchGpsToStore('driver:location:update', data);
    });

    socket.on('driver.gps.active', (data: VehiclePosition) => {
      dispatchGpsToStore('driver.gps.active', data);
    });

    socket.on('operational:location', (data: VehiclePosition) => {
      dispatchGpsToStore('operational:location', data);
    });

    socket.on('ops:state:replay', (data: { latestPosition?: VehiclePosition; route?: { id: string; status?: string; operationalState?: string }; driverId?: string; trackingPoints?: Array<{ lat: number; lng: number }> }) => {
      if (data.latestPosition) {
        dispatchGpsToStore('ops:state:replay', data.latestPosition);
      }
      if (data.route?.id) {
        record(`♻️ Estado recuperado: rota ${data.route.id}${data.route.operationalState ? ` (${data.route.operationalState})` : ''}`, 'route');
      }
      if ((data.trackingPoints?.length ?? 0) > 0) {
        if (data.latestPosition?.vehicleId) {
          for (const p of data.trackingPoints ?? []) {
            dispatchGpsToStore('ops:state:replay:tracking', {
              ...data.latestPosition,
              lat: p.lat,
              lng: p.lng,
            } as VehiclePosition);
          }
        }
        record(`📍 Replay de rastreio: ${data.trackingPoints?.length ?? 0} pontos`, 'vehicle');
      }
    });

    socket.on('trip:status', (data: { tripId: string; status: string }) => {
      record(`Viagem ${data.tripId} → ${data.status}`, 'trip');
    });

    socket.on('trip:boarding', (data: { tripId: string; patientId: string; patientName?: string }) => {
      record(`🟡 Embarque iniciado: ${data.patientName ?? data.patientId}`, 'boarding');
    });

    socket.on('trip:boarded', (data: { tripId: string; patientId: string; patientName?: string; boardedAt?: string }) => {
      record(`🟢 Embarcado: ${data.patientName ?? data.patientId}`, 'boarding');
      useRealtimeStore.getState().pushBoardingEvent({
        tripId: data.tripId,
        patientId: data.patientId,
        patientName: data.patientName,
        boardedAt: data.boardedAt ?? new Date().toISOString(),
      });
    });

    socket.on('trip:started', (data: { tripId: string; patientId?: string }) => {
      record(`🚀 Viagem iniciada: ${data.tripId}`, 'trip');
    });

    socket.on('trip:in_transit', (data: { tripId: string; patientId?: string }) => {
      record(`🚌 Em trânsito: ${data.tripId}`, 'trip');
    });

    socket.on('trip:arrived', (data: { tripId: string; patientId?: string }) => {
      record(`📍 Chegada registrada: ${data.tripId}`, 'trip');
    });

    socket.on('patient:boarded', (data: { tripId: string; patientId: string; patientName?: string; boardedAt?: string }) => {
      record(`🟢 Paciente embarcou: ${data.patientName ?? data.patientId}`, 'boarding');
      useRealtimeStore.getState().pushBoardingEvent({
        tripId: data.tripId,
        patientId: data.patientId,
        patientName: data.patientName,
        boardedAt: data.boardedAt ?? new Date().toISOString(),
      });
    });

    socket.on('trip:completed', (data: { tripId: string; patientId?: string }) => {
      record(`✅ Viagem concluída: ${data.tripId}`, 'trip');
    });

    socket.on('route:started', (data: { routeId: string; driverId?: string }) => {
      record(`🚀 Rota iniciada: ${data.routeId}`, 'route');
    });

    socket.on('route:completed', (data: { routeId: string }) => {
      record(`🏁 Rota finalizada: ${data.routeId}`, 'route');
    });

    socket.on('queue:update', (data: { patientId: string; action: string }) => {
      record(`Fila atualizada — Paciente ${data.patientId}`, 'queue');
    });

    socket.on('route:status', (data: { routeId: string; status: string }) => {
      record(`Rota ${data.routeId} → ${data.status}`, 'route');
    });

    socket.on('route.status_changed', (data: { routeId: string; status: string }) => {
      record(`Rota ${data.routeId} → ${data.status}`, 'route');
    });

    socket.on('route:operational_state', (data: { routeId: string; operationalState: string }) => {
      record(`🧭 Rota ${data.routeId} → ${data.operationalState}`, 'route');
    });

    socket.on('operational:state_changed', (data: { routeId?: string; tripId?: string; operationalState: string }) => {
      const target = data.tripId ? `viagem ${data.tripId}` : `rota ${data.routeId ?? '—'}`;
      record(`🔄 ${target} → ${data.operationalState}`, 'trip');
    });

    return () => {
      console.debug('[SOCKET] cleanup /operations', { tenantId });
      socket.disconnect();
    };
  }, [enabled, token, tenantId]);
}
