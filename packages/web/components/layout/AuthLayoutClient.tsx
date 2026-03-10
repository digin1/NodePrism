'use client';

import { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';

export function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything on the server - wait for client mount
  if (!mounted) {
    return (
      <div className="dashboard-grid flex min-h-screen items-center justify-center bg-background px-6">
        <div className="monitor-panel rounded-[1.5rem] px-10 py-12 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="mt-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Initializing console
          </p>
        </div>
      </div>
    );
  }

  return <AuthProvider>{children}</AuthProvider>;
}
