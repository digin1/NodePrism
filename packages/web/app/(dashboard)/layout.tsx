'use client';

import dynamic from 'next/dynamic';

// Dynamically import providers with SSR disabled to prevent static generation issues
const Providers = dynamic(() => import('@/components/providers').then(mod => ({ default: mod.Providers })), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  ),
});

const DashboardWrapper = dynamic(
  () => import('@/components/layout/DashboardWrapper').then(mod => ({ default: mod.DashboardWrapper })),
  { ssr: false }
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <DashboardWrapper>{children}</DashboardWrapper>
    </Providers>
  );
}
