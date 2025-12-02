'use client';

import { useState, useEffect } from 'react';
import { Providers } from '@/components/providers';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardWrapper } from '@/components/layout/DashboardWrapper';

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything on the server - wait for client mount
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <Providers>
        <DashboardWrapper>{children}</DashboardWrapper>
      </Providers>
    </AuthProvider>
  );
}
