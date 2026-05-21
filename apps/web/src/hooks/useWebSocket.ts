'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtime.store';
import { useAuthStore } from '@/store/auth.store';
import type { VehiclePosition } from '@/types';

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const setConnected = useRealtimeStore((s) => s.setConnected);
  const bumpRevision = useRealtimeStore((s) => s.bumpRevision);
  const updateVehiclePosition = useRealtimeStore((s) => s.updateVehiclePosition);
  const pushActivity = useRealtimeStore((s) => s.pushActivity);
  const pushBoardingEvent = useRealtimeStore((s) => s.pushBoardingEvent);

  useEffect(() => {
    if (!token || !tenantId) return;

    const socket = io(`${process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3010'}/operations`, {
      auth: { token },
      transports: ['websocket'],
    });

    const record = (message: string, type: 'route' | 'trip' | 'queue' | 'vehicle' | 'alert' | 'boarding' = 'trip') => {
      pushActivity({ message, type, timestamp: new Date().toISOString() });
      bumpRevision();
    };

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join:tenant', { tenantId });
      socket.emit('ops:state:request', { tenantId });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('vehicle:tracking', (data: VehiclePosition) => {
      updateVehiclePosition(data);
    });

    socket.on('vehicle:position', (data: VehiclePosition) => {
      updateVehiclePosition(data);
    });

    socket.on('vehicle.location_updated', (data: VehiclePosition) => {
      updateVehiclePosition(data);
    });

    socket.on('driver:location:update', (data: VehiclePosition) => {
      updateVehiclePosition(data);
    });

    socket.on('ops:state:replay', (data: { latestPosition?: VehiclePosition; route?: { id: string; status?: string }; driverId?: string }) => {
      if (data.latestPosition) {
        updateVehiclePosition(data.latestPosition);
      }
      if (data.route?.id) {
        record(`♻️ Estado recuperado: rota ${data.route.id}`, 'route');
      }
    });

    socket.on('trip:status', (data: { tripId: string; status: string }) => {
      record(`Viagem ${data.tripId} → ${data.status}`, 'trip');
    });

    socket.on('trip:boarding', (data: { tripId: string; patientId: string; patientName?: string }) => {
      record(`🟡 Embarque iniciado: ${data.patientName ?? data.patientId}`, 'boarding');
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
      pushBoardingEvent({ tripId: data.tripId, patientId: data.patientId, patientName: data.patientName, boardedAt: data.boardedAt ?? new Date().toISOString() });
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

    socket.on('operational:state_changed', (data: { routeId?: string; tripId?: string; operationalState: string }) => {
      const target = data.tripId ? `viagem ${data.tripId}` : `rota ${data.routeId ?? '—'}`;
      record(`🔄 ${target} → ${data.operationalState}`, 'trip');
    });

    return () => {
      socket.disconnect();
    };
  }, [token, tenantId, setConnected, bumpRevision, updateVehiclePosition, pushActivity, pushBoardingEvent]);
}
