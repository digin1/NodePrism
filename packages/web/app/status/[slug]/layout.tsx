// Force dynamic rendering for status pages
export const dynamic = 'force-dynamic';

export default function StatusPageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
