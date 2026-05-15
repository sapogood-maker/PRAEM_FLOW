'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useWebSocket } from '@/hooks/useWebSocket';
import { isValidElement } from 'react';

const queryClient = new QueryClient();

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useWebSocket();
  const isSlotObject =
    typeof children === 'object' &&
    children !== null &&
    !isValidElement(children) &&
    !Array.isArray(children) &&
    !(children instanceof Promise);
  const normalizedChildren = isSlotObject
    ? Object.values(children as unknown as Record<string, React.ReactNode>)
    : children;

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
