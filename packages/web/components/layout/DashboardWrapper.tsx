'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/layout/header';

const Sidebar = dynamic(() => import('@/components/layout/sidebar').then((mod) => mod.Sidebar), {
  ssr: false,
  loading: () => (
    <div className="hidden w-[18rem] border-r border-border/70 bg-card/70 md:block">
      <div className="flex h-20 items-center px-6">
        <div className="h-10 w-10 rounded-xl bg-muted" />
        <div className="ml-3 h-5 w-28 rounded-full bg-muted" />
      </div>
    </div>
  ),
});

const shortcuts = [
  { keys: ['g', 'd'], label: 'Go to Dashboard', path: '/dashboard' },
  { keys: ['g', 's'], label: 'Go to Servers', path: '/servers' },
  { keys: ['g', 'a'], label: 'Go to Alerts', path: '/alerts' },
  { keys: ['g', 'm'], label: 'Go to Metrics', path: '/metrics' },
  { keys: ['?'], label: 'Show keyboard shortcuts', path: null },
];

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="monitor-panel relative mx-4 w-full max-w-md rounded-[1.5rem] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          {shortcuts.map((s) => (
            <div key={s.keys.join('')} className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.map((k, i) => (
                  <span key={i}>
                    <kbd className="rounded-lg border border-border/80 bg-accent/50 px-2 py-1 text-xs text-foreground">
                      {k}
                    </kbd>
                    {i < s.keys.length - 1 && (
                      <span className="mx-1 text-xs text-muted-foreground">then</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Press{' '}
          <kbd className="rounded-md border border-border/80 bg-accent/50 px-1.5 py-0.5 text-xs">
            Esc
          </kbd>{' '}
          to close
        </p>
      </div>
    </div>
  );
}

export function DashboardWrapper({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const router = useRouter();
  const pendingKey = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        setShowShortcuts(false);
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      if (pendingKey.current === 'g') {
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingKey.current = null;
        const match = shortcuts.find(
          (s) => s.keys.length === 2 && s.keys[0] === 'g' && s.keys[1] === e.key
        );
        if (match?.path) {
          e.preventDefault();
          router.push(match.path);
        }
        return;
      }

      if (e.key === 'g') {
        pendingKey.current = 'g';
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(() => {
          pendingKey.current = null;
        }, 1000);
      }
    },
    [router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ProtectedRoute>
      <div className="dashboard-grid flex min-h-screen bg-background">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`
            fixed inset-y-0 left-0 z-50 w-[18rem] transform transition-transform duration-200 ease-in-out md:sticky md:top-0 md:h-screen md:self-start md:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main className="dashboard-surface flex-1 overflow-y-auto px-4 pb-8 pt-5 md:px-6 md:pt-6">
            <div className="page-shell">{children}</div>
          </main>
        </div>
      </div>
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </ProtectedRoute>
  );
}
