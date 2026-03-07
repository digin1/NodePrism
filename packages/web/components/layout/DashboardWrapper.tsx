'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/layout/header';

// Dynamically import Sidebar to avoid SSR issues with useQuery
const Sidebar = dynamic(
  () => import('@/components/layout/sidebar').then((mod) => mod.Sidebar),
  {
    ssr: false,
    loading: () => (
      <div className="hidden md:block w-64 bg-gray-900 animate-pulse">
        <div className="h-16 px-6 flex items-center">
          <div className="h-8 w-8 bg-gray-700 rounded-lg"></div>
          <div className="ml-2 h-6 w-24 bg-gray-700 rounded"></div>
        </div>
      </div>
    ),
  }
);

export function DashboardWrapper({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-100">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - hidden on mobile, visible on md+ */}
        <div
          className={`
            fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <Sidebar />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
