'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuthStore } from '@/store/auth.store';
import { normalizeChildren } from '@/lib/normalize-children';

const queryClient = new QueryClient();

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useWebSocket(mounted);
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const normalizedChildren = normalizeChildren(children);

  useEffect(() => {
    setMounted(true);
    console.debug('[REACT] dashboard hydration ready');
    console.debug('[SOCKET] dashboard layout mounted');
    return () => {
      console.debug('[REACT] dashboard layout cleanup');
      console.debug('[SOCKET] dashboard layout unmounted');
    };
  }, []);

  useEffect(() => {
    if (mounted && !token) router.push('/login');
  }, [mounted, token, router]);

  if (!mounted) return null;
  if (!token) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <div className='flex min-h-screen bg-background'>
        <Sidebar />
        <div className='flex-1'>
          <TopBar />
          <main className='space-y-6 p-6'>{normalizedChildren}</main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
