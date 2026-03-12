'use client';

import { useQuery } from '@tanstack/react-query';
import { alertApi } from '@/lib/api';

/**
 * Shared hook for the alertStats query.
 * Provides firing/critical/warning/resolved/silenced/acknowledged counts
 * with a 15s polling interval and 10s stale time.
 */
export function useAlertStats() {
  return useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertApi.stats(),
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
