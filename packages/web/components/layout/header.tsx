'use client';

import { useQuery } from '@tanstack/react-query';
import { alertApi, healthApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

interface AlertStats {
  firing?: number;
}

interface Health {
  status?: string;
}

export function Header() {
  const { data: alertStats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
    refetchInterval: 10000,
  });

  const stats = alertStats as AlertStats | undefined;
  const healthData = health as Health | undefined;
  const firingCount = stats?.firing ?? 0;

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900">Veeble Node Vitals</h1>
      </div>

      <div className="flex items-center gap-4">
        {firingCount > 0 && (
          <Badge variant="danger" className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {firingCount} Active Alert{firingCount !== 1 ? 's' : ''}
          </Badge>
        )}

        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              healthData?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-600">
            {healthData?.status === 'ok' ? 'System Healthy' : 'System Error'}
          </span>
        </div>
      </div>
    </header>
  );
}
