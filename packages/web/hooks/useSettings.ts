'use client';

import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';

/**
 * Shared hook for the system settings query.
 * Returns systemName, logoUrl, primaryColor, timezone, dateFormat, etc.
 * with a 5-minute stale time (settings rarely change).
 */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
}
