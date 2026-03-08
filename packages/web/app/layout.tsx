import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NodePrism',
  description: 'Advanced server monitoring system',
};

const themeScript = `
(function() {
  try {
    if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
      crypto.randomUUID = function() {
        return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function(c) {
          return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
        });
      };
    }
    var theme = localStorage.getItem('nodeprism_theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
