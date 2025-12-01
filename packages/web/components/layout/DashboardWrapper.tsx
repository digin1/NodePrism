'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/layout/header';

// Dynamically import Sidebar to avoid SSR issues with useQuery
const Sidebar = dynamic(
  () => import('@/components/layout/sidebar').then((mod) => mod.Sidebar),
  {
    ssr: false,
    loading: () => (
      <div className="w-64 bg-gray-900 animate-pulse">
        <div className="h-16 px-6 flex items-center">
          <div className="h-8 w-8 bg-gray-700 rounded-lg"></div>
          <div className="ml-2 h-6 w-24 bg-gray-700 rounded"></div>
        </div>
      </div>
    ),
  }
);

export function DashboardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
