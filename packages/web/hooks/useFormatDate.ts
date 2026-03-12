'use client';

import { useCallback } from 'react';
import { useSettings } from '@/hooks/useSettings';

/**
 * Formats a Date using the configured dateFormat pattern and timezone.
 */
function formatWithPattern(date: Date, pattern: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  const second = get('second');
  const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short' }).format(date);

  switch (pattern) {
    case 'YYYY-MM-DD HH:mm:ss': return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    case 'DD/MM/YYYY HH:mm:ss': return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
    case 'MM/DD/YYYY HH:mm:ss': return `${month}/${day}/${year} ${hour}:${minute}:${second}`;
    case 'DD-MM-YYYY HH:mm:ss': return `${day}-${month}-${year} ${hour}:${minute}:${second}`;
    case 'YYYY/MM/DD HH:mm:ss': return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    case 'MMM DD, YYYY HH:mm': return `${monthShort} ${day}, ${year} ${hour}:${minute}`;
    case 'DD MMM YYYY HH:mm': return `${day} ${monthShort} ${year} ${hour}:${minute}`;
    default: return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
}

function formatDatePart(date: Date, pattern: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short' }).format(date);

  if (pattern.startsWith('DD/MM')) return `${day}/${month}/${year}`;
  if (pattern.startsWith('MM/DD')) return `${month}/${day}/${year}`;
  if (pattern.startsWith('DD-MM')) return `${day}-${month}-${year}`;
  if (pattern.startsWith('YYYY/')) return `${year}/${month}/${day}`;
  if (pattern.startsWith('MMM')) return `${monthShort} ${day}, ${year}`;
  if (pattern.startsWith('DD MMM')) return `${day} ${monthShort} ${year}`;
  return `${year}-${month}-${day}`;
}

function formatTimePart(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${hour}:${get('minute')}:${get('second')}`;
}

/**
 * Hook that provides timezone-aware date formatting functions
 * using the system timezone and dateFormat from Settings.
 */
export function useFormatDate() {
  const { data: settings } = useSettings();

  const timezone = settings?.timezone || 'UTC';
  const dateFormat = settings?.dateFormat || 'YYYY-MM-DD HH:mm:ss';

  /** Format as full date+time string */
  const formatDateTime = useCallback((date: string | Date | number): string => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      return formatWithPattern(d, dateFormat, timezone);
    } catch {
      return String(date);
    }
  }, [timezone, dateFormat]);

  /** Format as date-only string */
  const formatDateOnly = useCallback((date: string | Date | number): string => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      return formatDatePart(d, dateFormat, timezone);
    } catch {
      return String(date);
    }
  }, [timezone, dateFormat]);

  /** Format as time-only string (HH:mm:ss) */
  const formatTimeOnly = useCallback((date: string | Date | number): string => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      return formatTimePart(d, timezone);
    } catch {
      return String(date);
    }
  }, [timezone]);

  return { formatDateTime, formatDateOnly, formatTimeOnly, timezone };
}
