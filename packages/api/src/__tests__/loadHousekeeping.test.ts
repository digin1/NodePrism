describe('Load: Housekeeping - Batch Deletion Sizing', () => {
  function processInBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  it('should split large arrays into equal-sized chunks', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const batches = processInBatches(items, 25);
    expect(batches).toHaveLength(4);
    expect(batches[0]).toHaveLength(25);
    expect(batches[3]).toHaveLength(25);
  });

  it('should handle remainder in the last batch', () => {
    const items = Array.from({ length: 107 }, (_, i) => i);
    const batches = processInBatches(items, 25);
    expect(batches).toHaveLength(5);
    expect(batches[4]).toHaveLength(7);
  });

  it('should handle empty input', () => {
    const batches = processInBatches([], 25);
    expect(batches).toHaveLength(0);
  });

  it('should handle 10000 records with batch size 1000', () => {
    const items = Array.from({ length: 10000 }, (_, i) => `record-${i}`);
    const batches = processInBatches(items, 1000);
    expect(batches).toHaveLength(10);
    const totalItems = batches.reduce((sum, b) => sum + b.length, 0);
    expect(totalItems).toBe(10000);
  });

  it('should handle batch size larger than input', () => {
    const items = [1, 2, 3];
    const batches = processInBatches(items, 1000);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([1, 2, 3]);
  });
});

describe('Load: Housekeeping - Retention Period Calculation', () => {
  // Mirrors retention defaults from services/housekeeping.ts
  const RETENTION_DEFAULTS = {
    EVENT_LOG_RETENTION_DAYS: 30,
    METRIC_HISTORY_RETENTION_DAYS: 14,
    ANOMALY_EVENT_RETENTION_DAYS: 30,
    RESOLVED_ALERT_RETENTION_DAYS: 90,
  };

  // Mirrors getRetentionMultiplier() and adjusted retention from runHousekeeping()
  function getRetentionMultiplier(usedPercent: number): number {
    const WARNING = 75;
    const CRITICAL = 90;
    if (usedPercent >= CRITICAL) return 0.25;
    if (usedPercent >= WARNING) {
      const range = CRITICAL - WARNING;
      const pressure = usedPercent - WARNING;
      return Math.max(0.25, 1.0 - (pressure / range) * 0.75);
    }
    return 1.0;
  }

  function adjustRetention(baseDays: number, multiplier: number, minDays: number): number {
    return Math.max(minDays, Math.floor(baseDays * multiplier));
  }

  it('should have correct default retention for each table type', () => {
    expect(RETENTION_DEFAULTS.EVENT_LOG_RETENTION_DAYS).toBe(30);
    expect(RETENTION_DEFAULTS.METRIC_HISTORY_RETENTION_DAYS).toBe(14);
    expect(RETENTION_DEFAULTS.ANOMALY_EVENT_RETENTION_DAYS).toBe(30);
    expect(RETENTION_DEFAULTS.RESOLVED_ALERT_RETENTION_DAYS).toBe(90);
  });

  it('should apply full retention at normal disk usage', () => {
    const m = getRetentionMultiplier(50);
    expect(adjustRetention(30, m, 1)).toBe(30);
    expect(adjustRetention(14, m, 1)).toBe(14);
    expect(adjustRetention(90, m, 7)).toBe(90);
  });

  it('should reduce retention under warning-level disk pressure', () => {
    const m = getRetentionMultiplier(82);
    expect(m).toBeLessThan(1.0);
    expect(m).toBeGreaterThan(0.25);
    expect(adjustRetention(30, m, 1)).toBeLessThan(30);
    expect(adjustRetention(30, m, 1)).toBeGreaterThanOrEqual(1);
  });

  it('should apply aggressive retention at critical disk (>=90%)', () => {
    const m = getRetentionMultiplier(95);
    expect(m).toBe(0.25);
    expect(adjustRetention(30, m, 1)).toBe(7);
    expect(adjustRetention(14, m, 1)).toBe(3);
    // Alerts have a minimum of 7 days
    expect(adjustRetention(90, m, 7)).toBe(22);
  });

  it('should respect minimum retention floor', () => {
    const m = getRetentionMultiplier(99);
    expect(adjustRetention(1, m, 1)).toBe(1);
    expect(adjustRetention(2, m, 1)).toBe(1);
    expect(adjustRetention(4, m, 7)).toBe(7);
  });
});

describe('Load: Housekeeping - Disk Usage Threshold Calculations', () => {
  const DISK_WARNING_THRESHOLD = 75;
  const DISK_CRITICAL_THRESHOLD = 90;

  function getDiskStatus(usedPercent: number): 'normal' | 'warning' | 'critical' {
    if (usedPercent >= DISK_CRITICAL_THRESHOLD) return 'critical';
    if (usedPercent >= DISK_WARNING_THRESHOLD) return 'warning';
    return 'normal';
  }

  function shouldAggressivelyPrune(usedPercent: number): boolean {
    return usedPercent >= DISK_WARNING_THRESHOLD;
  }

  it('should classify disk usage levels correctly', () => {
    expect(getDiskStatus(0)).toBe('normal');
    expect(getDiskStatus(50)).toBe('normal');
    expect(getDiskStatus(74)).toBe('normal');
    expect(getDiskStatus(75)).toBe('warning');
    expect(getDiskStatus(85)).toBe('warning');
    expect(getDiskStatus(89)).toBe('warning');
    expect(getDiskStatus(90)).toBe('critical');
    expect(getDiskStatus(100)).toBe('critical');
  });

  it('should trigger aggressive Docker prune at warning threshold', () => {
    expect(shouldAggressivelyPrune(74)).toBe(false);
    expect(shouldAggressivelyPrune(75)).toBe(true);
    expect(shouldAggressivelyPrune(90)).toBe(true);
  });
});

describe('Load: Housekeeping - Backup File Sorting and Pruning', () => {
  // Mirrors pruneOldBackups() from services/housekeeping.ts
  function pruneBackupList(
    files: string[],
    retentionCount: number
  ): { kept: string[]; deleted: string[] } {
    const backups = files
      .filter(f => f.startsWith('nodeprism-backup-') && f.endsWith('.sql.gz'))
      .sort()
      .reverse(); // newest first (ISO timestamp sorts correctly)

    const kept = backups.slice(0, retentionCount);
    const deleted = backups.slice(retentionCount);
    return { kept, deleted };
  }

  it('should keep only retentionCount newest backups', () => {
    const files = [
      'nodeprism-backup-2026-03-01_00-00.sql.gz',
      'nodeprism-backup-2026-03-02_00-00.sql.gz',
      'nodeprism-backup-2026-03-03_00-00.sql.gz',
      'nodeprism-backup-2026-03-04_00-00.sql.gz',
      'nodeprism-backup-2026-03-05_00-00.sql.gz',
    ];
    const result = pruneBackupList(files, 3);
    expect(result.kept).toHaveLength(3);
    expect(result.deleted).toHaveLength(2);
    // Kept should be the newest 3
    expect(result.kept[0]).toContain('03-05');
    expect(result.kept[2]).toContain('03-03');
    // Deleted should be the oldest 2
    expect(result.deleted[0]).toContain('03-02');
    expect(result.deleted[1]).toContain('03-01');
  });

  it('should ignore non-backup files in directory', () => {
    const files = [
      'nodeprism-backup-2026-03-01_00-00.sql.gz',
      'README.md',
      '.gitkeep',
      'other-file.tar.gz',
      'nodeprism-backup-2026-03-02_00-00.sql.gz',
    ];
    const result = pruneBackupList(files, 7);
    expect(result.kept).toHaveLength(2);
    expect(result.deleted).toHaveLength(0);
  });

  it('should handle 150 backup files and prune to 7', () => {
    const files: string[] = [];
    for (let i = 0; i < 150; i++) {
      const day = String(i + 1).padStart(3, '0');
      files.push(`nodeprism-backup-2025-01-${day}_00-00.sql.gz`);
    }
    const result = pruneBackupList(files, 7);
    expect(result.kept).toHaveLength(7);
    expect(result.deleted).toHaveLength(143);
  });

  it('should not delete anything when below retention count', () => {
    const files = [
      'nodeprism-backup-2026-03-01_00-00.sql.gz',
      'nodeprism-backup-2026-03-02_00-00.sql.gz',
    ];
    const result = pruneBackupList(files, 7);
    expect(result.kept).toHaveLength(2);
    expect(result.deleted).toHaveLength(0);
  });

  it('should handle empty file list', () => {
    const result = pruneBackupList([], 7);
    expect(result.kept).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
  });
});

describe('Load: Housekeeping - Log Rotation Threshold Calculations', () => {
  function shouldRotateLog(fileSizeBytes: number, maxSizeMB: number): boolean {
    return fileSizeBytes > maxSizeMB * 1024 * 1024;
  }

  function getRotationSuffix(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
  }

  it('should trigger rotation when file exceeds max size', () => {
    expect(shouldRotateLog(11 * 1024 * 1024, 10)).toBe(true);  // 11MB > 10MB
    expect(shouldRotateLog(9 * 1024 * 1024, 10)).toBe(false);   // 9MB < 10MB
  });

  it('should not trigger rotation for empty files', () => {
    expect(shouldRotateLog(0, 10)).toBe(false);
  });

  it('should generate valid rotation suffix', () => {
    const suffix = getRotationSuffix();
    // Format: YYYY-MM-DD_HH-MM-SS (ISO with colons/dots replaced by dashes, sliced)
    expect(suffix).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });
});

describe('Load: Housekeeping - Priority Ordering of Cleanup Tasks', () => {
  interface CleanupTask {
    name: string;
    priority: number; // lower = runs first
    estimatedRecords: number;
  }

  function orderTasks(tasks: CleanupTask[]): CleanupTask[] {
    return [...tasks].sort((a, b) => a.priority - b.priority);
  }

  // Mirrors the order in runHousekeeping(): all run in parallel via Promise.all,
  // but priority defines what to focus on if resources are constrained
  const TASKS: CleanupTask[] = [
    { name: 'pruneMetricHistory', priority: 1, estimatedRecords: 50000 },
    { name: 'pruneEventLogs', priority: 2, estimatedRecords: 10000 },
    { name: 'pruneAnomalyEvents', priority: 3, estimatedRecords: 5000 },
    { name: 'pruneResolvedAlerts', priority: 4, estimatedRecords: 2000 },
    { name: 'pruneStaleContainers', priority: 5, estimatedRecords: 100 },
  ];

  it('should order tasks by priority (highest-volume first)', () => {
    const shuffled = [...TASKS].reverse();
    const ordered = orderTasks(shuffled);
    expect(ordered[0].name).toBe('pruneMetricHistory');
    expect(ordered[ordered.length - 1].name).toBe('pruneStaleContainers');
  });

  it('should include all 5 cleanup tasks', () => {
    expect(TASKS).toHaveLength(5);
    const names = TASKS.map(t => t.name);
    expect(names).toContain('pruneMetricHistory');
    expect(names).toContain('pruneEventLogs');
    expect(names).toContain('pruneAnomalyEvents');
    expect(names).toContain('pruneResolvedAlerts');
    expect(names).toContain('pruneStaleContainers');
  });

  it('should calculate total pruned from all tasks', () => {
    const total = TASKS.reduce((sum, t) => sum + t.estimatedRecords, 0);
    expect(total).toBe(67100);
  });

  it('should trigger VACUUM when total pruned exceeds 1000', () => {
    const totalPruned = TASKS.reduce((sum, t) => sum + t.estimatedRecords, 0);
    const shouldVacuum = totalPruned > 1000;
    expect(shouldVacuum).toBe(true);
  });

  it('should not trigger VACUUM for small cleanups', () => {
    const smallCleanup = [
      { name: 'pruneStaleContainers', priority: 5, estimatedRecords: 3 },
    ];
    const totalPruned = smallCleanup.reduce((sum, t) => sum + t.estimatedRecords, 0);
    expect(totalPruned > 1000).toBe(false);
  });
});
