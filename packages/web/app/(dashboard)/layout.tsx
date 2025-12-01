'use client';

import { Providers } from '@/components/providers';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardWrapper } from '@/components/layout/DashboardWrapper';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Providers>
        <DashboardWrapper>{children}</DashboardWrapper>
      </Providers>
    </AuthProvider>
  );
}
