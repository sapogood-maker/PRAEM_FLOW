'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtime.store';

export function useWebSocket() {
  const setConnected = useRealtimeStore((s) => s.setConnected);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3010');
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => {
      socket.disconnect();
    };
  }, [setConnected]);
}
