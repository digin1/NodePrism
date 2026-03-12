'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { alertApi, healthApi, settingsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface AlertStats {
  firing?: number;
  critical?: number;
}

interface Health {
  status?: string;
}

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('nodeprism_theme', next ? 'dark' : 'light');
  }, [isDark]);

  const { data: alertStats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
    refetchInterval: 10000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });

  const stats = alertStats as AlertStats | undefined;
  const healthData = health as Health | undefined;
  const firingCount = stats?.firing ?? 0;
  const criticalCount = stats?.critical ?? 0;
  const systemName = settings?.systemName || 'NodePrism';
  const isHealthy = healthData?.status === 'ok';

  return (
    <header className="border-b subtle-divider bg-background/70 px-4 py-4 backdrop-blur-xl md:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          {onMenuToggle && (
            <button
              onClick={onMenuToggle}
              className="rounded-xl border border-border/70 bg-card/60 p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              Monitoring Console
            </p>
            <h1 className="text-xl font-semibold">{systemName}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className={`status-pill ${isHealthy ? 'text-emerald-400' : 'text-red-400'}`}>
            {isHealthy ? 'Healthy' : 'Degraded'}
          </div>

          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
            <span>{isDark ? 'Day Shift' : 'Night Shift'}</span>
          </button>

          <div className="rounded-full border border-border/70 bg-card/70 px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${criticalCount > 0 ? 'animate-status-glow bg-red-500' : firingCount > 0 ? 'bg-amber-500' : 'animate-pulse-dot bg-primary'}`}
              />
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Active Alerts
              </span>
              <a
                href="/alerts"
                className={`metric-text text-sm ${criticalCount > 0 ? 'text-red-400' : firingCount > 0 ? 'text-amber-400' : 'text-foreground'}`}
              >
                {firingCount}
              </a>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-full border border-border/70 bg-card/70 px-3 py-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium leading-tight">{user?.name}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {user?.role}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              title="Logout"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
