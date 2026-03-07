import { z } from 'zod';

describe('Maintenance Window Validation', () => {
  const schema = z.object({
    serverId: z.string().uuid(),
    reason: z.string().min(1).max(500),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  }).refine(data => new Date(data.endTime) > new Date(data.startTime), {
    message: 'End time must be after start time',
  });

  it('should accept valid maintenance window', () => {
    const result = schema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Scheduled upgrade',
      startTime: '2026-03-08T00:00:00.000Z',
      endTime: '2026-03-08T04:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing reason', () => {
    const result = schema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      reason: '',
      startTime: '2026-03-08T00:00:00.000Z',
      endTime: '2026-03-08T04:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('should reject end time before start time', () => {
    const result = schema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Upgrade',
      startTime: '2026-03-08T04:00:00.000Z',
      endTime: '2026-03-08T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('should reject end time equal to start time', () => {
    const result = schema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Upgrade',
      startTime: '2026-03-08T04:00:00.000Z',
      endTime: '2026-03-08T04:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID', () => {
    const result = schema.safeParse({
      serverId: 'not-a-uuid',
      reason: 'Upgrade',
      startTime: '2026-03-08T00:00:00.000Z',
      endTime: '2026-03-08T04:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('should reject reason over 500 chars', () => {
    const result = schema.safeParse({
      serverId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'x'.repeat(501),
      startTime: '2026-03-08T00:00:00.000Z',
      endTime: '2026-03-08T04:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('Maintenance Window - Active Check', () => {
  function isInMaintenance(
    windows: Array<{ startTime: Date; endTime: Date; serverId: string }>,
    serverId: string,
    now: Date
  ): boolean {
    return windows.some(
      w => w.serverId === serverId && w.startTime <= now && w.endTime >= now
    );
  }

  const windows = [
    {
      serverId: 'server-1',
      startTime: new Date('2026-03-08T00:00:00Z'),
      endTime: new Date('2026-03-08T04:00:00Z'),
    },
    {
      serverId: 'server-2',
      startTime: new Date('2026-03-10T00:00:00Z'),
      endTime: new Date('2026-03-10T06:00:00Z'),
    },
  ];

  it('should detect server in active maintenance', () => {
    expect(isInMaintenance(windows, 'server-1', new Date('2026-03-08T02:00:00Z'))).toBe(true);
  });

  it('should detect server not in maintenance', () => {
    expect(isInMaintenance(windows, 'server-1', new Date('2026-03-08T05:00:00Z'))).toBe(false);
  });

  it('should handle boundary: exactly at start time', () => {
    expect(isInMaintenance(windows, 'server-1', new Date('2026-03-08T00:00:00Z'))).toBe(true);
  });

  it('should handle boundary: exactly at end time', () => {
    expect(isInMaintenance(windows, 'server-1', new Date('2026-03-08T04:00:00Z'))).toBe(true);
  });

  it('should not affect other servers', () => {
    expect(isInMaintenance(windows, 'server-3', new Date('2026-03-08T02:00:00Z'))).toBe(false);
  });

  it('should handle empty windows list', () => {
    expect(isInMaintenance([], 'server-1', new Date())).toBe(false);
  });
});

describe('Alert Suppression During Maintenance', () => {
  function shouldSuppressAlert(
    serverId: string | null,
    maintenanceServerIds: Set<string>
  ): boolean {
    return serverId !== null && maintenanceServerIds.has(serverId);
  }

  it('should suppress alerts for servers in maintenance', () => {
    const inMaintenance = new Set(['server-1', 'server-2']);
    expect(shouldSuppressAlert('server-1', inMaintenance)).toBe(true);
  });

  it('should not suppress alerts for servers not in maintenance', () => {
    const inMaintenance = new Set(['server-1']);
    expect(shouldSuppressAlert('server-3', inMaintenance)).toBe(false);
  });

  it('should not suppress when no server ID', () => {
    const inMaintenance = new Set(['server-1']);
    expect(shouldSuppressAlert(null, inMaintenance)).toBe(false);
  });

  it('should not suppress when no maintenance windows', () => {
    expect(shouldSuppressAlert('server-1', new Set())).toBe(false);
  });
});

describe('Maintenance Window Overlap Detection', () => {
  function hasOverlap(
    a: { startTime: Date; endTime: Date },
    b: { startTime: Date; endTime: Date }
  ): boolean {
    return a.startTime < b.endTime && b.startTime < a.endTime;
  }

  it('should detect overlapping windows', () => {
    const a = { startTime: new Date('2026-03-08T00:00:00Z'), endTime: new Date('2026-03-08T04:00:00Z') };
    const b = { startTime: new Date('2026-03-08T03:00:00Z'), endTime: new Date('2026-03-08T06:00:00Z') };
    expect(hasOverlap(a, b)).toBe(true);
  });

  it('should detect non-overlapping windows', () => {
    const a = { startTime: new Date('2026-03-08T00:00:00Z'), endTime: new Date('2026-03-08T04:00:00Z') };
    const b = { startTime: new Date('2026-03-08T05:00:00Z'), endTime: new Date('2026-03-08T08:00:00Z') };
    expect(hasOverlap(a, b)).toBe(false);
  });

  it('should detect adjacent windows as non-overlapping', () => {
    const a = { startTime: new Date('2026-03-08T00:00:00Z'), endTime: new Date('2026-03-08T04:00:00Z') };
    const b = { startTime: new Date('2026-03-08T04:00:00Z'), endTime: new Date('2026-03-08T08:00:00Z') };
    expect(hasOverlap(a, b)).toBe(false);
  });

  it('should detect contained windows', () => {
    const a = { startTime: new Date('2026-03-08T00:00:00Z'), endTime: new Date('2026-03-08T08:00:00Z') };
    const b = { startTime: new Date('2026-03-08T02:00:00Z'), endTime: new Date('2026-03-08T06:00:00Z') };
    expect(hasOverlap(a, b)).toBe(true);
  });
});

describe('Maintenance Window Time Formatting', () => {
  function formatDuration(startTime: Date, endTime: Date): string {
    const diffMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

  it('should format hours and minutes', () => {
    const start = new Date('2026-03-08T00:00:00Z');
    const end = new Date('2026-03-08T02:30:00Z');
    expect(formatDuration(start, end)).toBe('2h 30m');
  });

  it('should format exact hours', () => {
    const start = new Date('2026-03-08T00:00:00Z');
    const end = new Date('2026-03-08T04:00:00Z');
    expect(formatDuration(start, end)).toBe('4h');
  });

  it('should format minutes only', () => {
    const start = new Date('2026-03-08T00:00:00Z');
    const end = new Date('2026-03-08T00:45:00Z');
    expect(formatDuration(start, end)).toBe('45m');
  });
});
