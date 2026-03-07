'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/layout/header';

const Sidebar = dynamic(
  () => import('@/components/layout/sidebar').then((mod) => mod.Sidebar),
  {
    ssr: false,
    loading: () => (
      <div className="hidden md:block w-64 bg-gray-900 animate-pulse">
        <div className="h-16 px-6 flex items-center">
          <div className="h-8 w-8 bg-gray-700 rounded-lg"></div>
          <div className="ml-2 h-6 w-24 bg-gray-700 rounded"></div>
        </div>
      </div>
    ),
  }
);

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
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl border dark:border-gray-700 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          {shortcuts.map((s) => (
            <div key={s.keys.join('')} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.map((k, i) => (
                  <span key={i}>
                    <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 border dark:border-gray-600 rounded text-gray-700 dark:text-gray-300">
                      {k}
                    </kbd>
                    {i < s.keys.length - 1 && (
                      <span className="mx-1 text-xs text-gray-400">then</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-800 border dark:border-gray-600 rounded">Esc</kbd> to close
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) {
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
      const match = shortcuts.find((s) => s.keys.length === 2 && s.keys[0] === 'g' && s.keys[1] === e.key);
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
      return;
    }
  }, [router]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={`
            fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <Sidebar />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </ProtectedRoute>
  );
}
