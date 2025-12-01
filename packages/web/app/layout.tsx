import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClientOnly } from '@/components/ClientOnly';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NodePrism',
  description: 'Advanced server monitoring system',
};

// Loading fallback during SSR/initial render
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientOnly fallback={<LoadingFallback />}>
          <AuthProvider>{children}</AuthProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
