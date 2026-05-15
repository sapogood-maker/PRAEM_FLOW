'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtime.store';
import type { VehiclePosition } from '@/types';

export function useWebSocket() {
  const setConnected = useRealtimeStore((s) => s.setConnected);
  const updateVehiclePosition = useRealtimeStore((s) => s.updateVehiclePosition);
  const pushActivity = useRealtimeStore((s) => s.pushActivity);

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

    socket.on('queue:update', (data: { patientId: string; action: string }) => {
      pushActivity({ message: `Fila atualizada — Paciente ${data.patientId}`, type: 'queue', timestamp: new Date().toISOString() });
    });

    socket.on('route:status', (data: { routeId: string; status: string }) => {
      pushActivity({ message: `Rota ${data.routeId} → ${data.status}`, type: 'route', timestamp: new Date().toISOString() });
    });

    return () => {
      socket.disconnect();
    };
  }, [setConnected, updateVehiclePosition, pushActivity]);
}
