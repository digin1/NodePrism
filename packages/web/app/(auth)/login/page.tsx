'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SystemSettings {
  systemName: string;
  logoUrl?: string | null;
  primaryColor: string;
  managerHostname?: string | null;
  managerIp?: string | null;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.success) {
          setSettings(data.data);
        }
      } catch {
        // Use defaults when the settings endpoint is unavailable.
      }
    };

    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logoUrl = settings?.logoUrl || null;
  const systemName = settings?.systemName || 'NodePrism';
  const primaryColor = settings?.primaryColor || '#3B82F6';

  return (
    <div className="dashboard-grid flex min-h-screen items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="page-intro hidden rounded-[2rem] border border-border/70 bg-card/30 p-10 lg:block">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-primary">
            NodePrism
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight text-balance">
            Infrastructure monitoring that feels like a live operations floor.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Track system health, incidents, alerts, logs, and fleet telemetry from a console built
            for fast response.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['Telemetry', 'Live metrics, trends, and Prometheus-backed analysis'],
              ['Incidents', 'Critical states surfaced with urgency, not noise'],
              ['Control', 'One place to manage servers, agents, rules, and reports'],
            ].map(([title, copy]) => (
              <div key={title} className="monitor-panel rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-primary">{title}</p>
                <p className="mt-3 text-sm text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="monitor-panel page-intro mx-auto w-full max-w-md rounded-[2rem] p-8 sm:p-10">
          <div className="text-center">
            <div className="mb-5 flex justify-center">
              <div className="flex min-h-[56px] min-w-[56px] items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-white px-3 py-1">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={systemName}
                    style={{ height: '40px', width: 'auto', maxWidth: '160px' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                    {systemName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            {!logoUrl && <h1 className="text-3xl font-bold">{systemName}</h1>}
            <p className="mt-3 text-sm uppercase tracking-[0.28em] text-muted-foreground">
              Secure operator sign in
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
                  Operator Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
              style={{ backgroundColor: primaryColor }}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="hover:underline" style={{ color: primaryColor }}>
                Register here
              </Link>
            </p>
          </form>

          {(settings?.managerHostname || settings?.managerIp) && (
            <div className="mt-6 border-t subtle-divider pt-4 text-center">
              <p className="metric-text text-xs text-muted-foreground">
                {settings.managerHostname}
                {settings.managerIp && ` • ${settings.managerIp}`}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
