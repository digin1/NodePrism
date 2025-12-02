// Force dynamic rendering for all dashboard pages
export const dynamic = 'force-dynamic';

import { DashboardLayoutClient } from '@/components/layout/DashboardLayoutClient';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
