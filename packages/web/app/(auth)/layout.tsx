// Force dynamic rendering for all auth pages
export const dynamic = 'force-dynamic';

import { AuthLayoutClient } from '@/components/layout/AuthLayoutClient';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayoutClient>{children}</AuthLayoutClient>;
}
