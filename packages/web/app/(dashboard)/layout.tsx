import { Providers } from '@/components/providers';
import { DashboardWrapper } from '@/components/layout/DashboardWrapper';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <DashboardWrapper>{children}</DashboardWrapper>
    </Providers>
  );
}
