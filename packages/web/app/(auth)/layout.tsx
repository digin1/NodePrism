'use client';

// Auth pages don't need additional providers, they use the root AuthProvider
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
