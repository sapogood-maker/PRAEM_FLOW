'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtime.store';
import type { VehiclePosition } from '@/types';

export function useWebSocket() {
  const setConnected = useRealtimeStore((s) => s.setConnected);
  const updateVehiclePosition = useRealtimeStore((s) => s.updateVehiclePosition);
  const pushActivity = useRealtimeStore((s) => s.pushActivity);
  const pushBoardingEvent = useRealtimeStore((s) => s.pushBoardingEvent);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3010');

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('vehicle:tracking', (data: VehiclePosition) => {
      updateVehiclePosition(data);
    });

    socket.on('vehicle:position', (data: VehiclePosition) => {
      updateVehiclePosition(data);
    });

    socket.on('trip:status', (data: { tripId: string; status: string }) => {
      pushActivity({ message: `Viagem ${data.tripId} → ${data.status}`, type: 'trip', timestamp: new Date().toISOString() });
    });

    socket.on('patient:boarded', (data: { tripId: string; patientId: string; patientName?: string; boardedAt?: string }) => {
      pushActivity({ message: `🟢 Paciente embarcou: ${data.patientName ?? data.patientId}`, type: 'boarding', timestamp: new Date().toISOString() });
      pushBoardingEvent({ tripId: data.tripId, patientId: data.patientId, patientName: data.patientName, boardedAt: data.boardedAt ?? new Date().toISOString() });
    });

    socket.on('trip:completed', (data: { tripId: string; patientId?: string }) => {
      pushActivity({ message: `✅ Viagem concluída: ${data.tripId}`, type: 'trip', timestamp: new Date().toISOString() });
    });

    socket.on('route:started', (data: { routeId: string; driverId?: string }) => {
      pushActivity({ message: `🚀 Rota iniciada: ${data.routeId}`, type: 'route', timestamp: new Date().toISOString() });
    });

    socket.on('route:completed', (data: { routeId: string }) => {
      pushActivity({ message: `🏁 Rota finalizada: ${data.routeId}`, type: 'route', timestamp: new Date().toISOString() });
    });

    socket.on('queue:update', (data: { patientId: string; action: string }) => {
      pushActivity({ message: `Fila atualizada — Paciente ${data.patientId}`, type: 'queue', timestamp: new Date().toISOString() });
    });

    socket.on('route:status', (data: { routeId: string; status: string }) => {
      pushActivity({ message: `Rota ${data.routeId} → ${data.status}`, type: 'route', timestamp: new Date().toISOString() });
    });

    return () => {
      socket.disconnect();
    };
  }, [setConnected, updateVehiclePosition, pushActivity, pushBoardingEvent]);
}
