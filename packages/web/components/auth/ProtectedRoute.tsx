'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="dashboard-grid flex min-h-screen items-center justify-center bg-background px-6">
        <div className="monitor-panel rounded-[1.5rem] px-10 py-12 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="mt-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Verifying operator session
          </p>
          <button
            onClick={() => {
              localStorage.removeItem('nodeprism_token');
              window.location.href = '/login';
            }}
            className="mt-4 text-sm text-muted-foreground underline hover:text-foreground"
          >
            Taking too long? Click here to login
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
