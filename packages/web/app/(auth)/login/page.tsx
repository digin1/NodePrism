'use client';

// Force dynamic rendering to avoid static generation issues with auth context
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

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

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.success) {
          setSettings(data.data);
        }
      } catch (e) {
        // Silently fail - use defaults
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

  // Logo URL - local paths are proxied via Next.js rewrites
  const logoUrl = settings?.logoUrl || null;
  const systemName = settings?.systemName || 'NodePrism';
  const primaryColor = settings?.primaryColor || '#3B82F6';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-gray-800 rounded-lg shadow-xl">
        <div className="text-center">
          {/* Logo and System Name */}
          <div className="flex justify-center mb-4">
            <div
              className="rounded-lg flex items-center justify-center overflow-hidden bg-white py-1 px-3"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={systemName}
                  style={{ height: '40px', width: 'auto', maxWidth: '160px' }}
                />
              ) : (
                <span className="font-bold text-2xl" style={{ color: primaryColor }}>
                  {systemName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          {!logoUrl && (
            <h1 className="text-3xl font-bold text-white">
              {systemName}
            </h1>
          )}
          <h2 className="mt-2 text-gray-400">
            Sign in to your account
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="********"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: primaryColor }}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="mt-4 text-center text-sm text-gray-400">
            Don't have an account?{' '}
            <Link
              href="/register"
              className="hover:underline"
              style={{ color: primaryColor }}
            >
              Register here
            </Link>
          </p>
        </form>

        {/* Subtle system info at bottom */}
        {(settings?.managerHostname || settings?.managerIp) && (
          <div className="mt-6 pt-4 border-t border-gray-700 text-center">
            <p className="text-xs text-gray-600">
              {settings.managerHostname}
              {settings.managerIp && ` • ${settings.managerIp}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
