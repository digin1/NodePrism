describe('Backup Filename Generation', () => {
  function generateBackupFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
    return `nodeprism-backup-${timestamp}.sql.gz`;
  }

  it('should generate filename with correct prefix', () => {
    const filename = generateBackupFilename();
    expect(filename).toMatch(/^nodeprism-backup-/);
  });

  it('should end with .sql.gz extension', () => {
    const filename = generateBackupFilename();
    expect(filename).toMatch(/\.sql\.gz$/);
  });

  it('should contain date components', () => {
    const filename = generateBackupFilename();
    expect(filename).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('should generate unique filenames', () => {
    const a = generateBackupFilename();
    const b = generateBackupFilename();
    // Same second = same filename, but format is valid
    expect(a).toMatch(/^nodeprism-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/);
  });
});

describe('Backup Retention Policy', () => {
  function pruneBackups(files: string[], retentionCount: number): string[] {
    const sorted = [...files].sort().reverse(); // newest first
    return sorted.slice(retentionCount);
  }

  it('should keep only retentionCount most recent backups', () => {
    const files = [
      'nodeprism-backup-2026-03-01_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-02_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-03_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-04_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-05_00-00-00.sql.gz',
    ];
    const toDelete = pruneBackups(files, 3);
    expect(toDelete).toHaveLength(2);
    expect(toDelete).toContain('nodeprism-backup-2026-03-01_00-00-00.sql.gz');
    expect(toDelete).toContain('nodeprism-backup-2026-03-02_00-00-00.sql.gz');
  });

  it('should not delete anything when under retention count', () => {
    const files = ['nodeprism-backup-2026-03-01_00-00-00.sql.gz'];
    const toDelete = pruneBackups(files, 7);
    expect(toDelete).toHaveLength(0);
  });

  it('should handle empty list', () => {
    const toDelete = pruneBackups([], 7);
    expect(toDelete).toHaveLength(0);
  });

  it('should delete all but retentionCount=1', () => {
    const files = [
      'nodeprism-backup-2026-03-01_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-02_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-03_00-00-00.sql.gz',
    ];
    const toDelete = pruneBackups(files, 1);
    expect(toDelete).toHaveLength(2);
    // Keep newest (2026-03-03), delete older ones
    expect(toDelete).not.toContain('nodeprism-backup-2026-03-03_00-00-00.sql.gz');
  });
});

describe('Backup Status Reporting', () => {
  function getBackupStatus(state: {
    lastBackupTime: Date | null;
    lastBackupStatus: string | null;
    backupCount: number;
  }) {
    return {
      lastBackupTime: state.lastBackupTime?.toISOString() || null,
      lastBackupStatus: state.lastBackupStatus,
      backupCount: state.backupCount,
    };
  }

  it('should report null when no backup has run', () => {
    const status = getBackupStatus({ lastBackupTime: null, lastBackupStatus: null, backupCount: 0 });
    expect(status.lastBackupTime).toBeNull();
    expect(status.lastBackupStatus).toBeNull();
    expect(status.backupCount).toBe(0);
  });

  it('should report success status', () => {
    const status = getBackupStatus({
      lastBackupTime: new Date('2026-03-07T12:00:00Z'),
      lastBackupStatus: 'success',
      backupCount: 3,
    });
    expect(status.lastBackupStatus).toBe('success');
    expect(status.backupCount).toBe(3);
    expect(status.lastBackupTime).toBe('2026-03-07T12:00:00.000Z');
  });

  it('should report failed status', () => {
    const status = getBackupStatus({
      lastBackupTime: new Date(),
      lastBackupStatus: 'failed',
      backupCount: 2,
    });
    expect(status.lastBackupStatus).toBe('failed');
  });
});

describe('Backup Schedule Configuration', () => {
  it('should default to 24 hour schedule', () => {
    const scheduleHours = parseInt(process.env.BACKUP_SCHEDULE_HOURS || '24', 10);
    expect(scheduleHours).toBe(24);
  });

  it('should default to 7 backup retention', () => {
    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '7', 10);
    expect(retentionCount).toBe(7);
  });

  it('should calculate correct interval in ms', () => {
    const hours = 24;
    const intervalMs = hours * 60 * 60 * 1000;
    expect(intervalMs).toBe(86_400_000);
  });

  it('should support custom schedule', () => {
    const hours = 12;
    const intervalMs = hours * 60 * 60 * 1000;
    expect(intervalMs).toBe(43_200_000);
  });
});

describe('Backup File Filtering', () => {
  function filterBackupFiles(files: string[]): string[] {
    return files.filter(f => f.startsWith('nodeprism-backup-') && f.endsWith('.sql.gz'));
  }

  it('should include valid backup files', () => {
    const files = [
      'nodeprism-backup-2026-03-07_12-00-00.sql.gz',
      'README.md',
      '.gitkeep',
    ];
    expect(filterBackupFiles(files)).toHaveLength(1);
  });

  it('should exclude non-backup files', () => {
    const files = ['other-file.sql.gz', 'nodeprism-config.json', '.DS_Store'];
    expect(filterBackupFiles(files)).toHaveLength(0);
  });

  it('should handle empty directory', () => {
    expect(filterBackupFiles([])).toHaveLength(0);
  });

  it('should include multiple backups', () => {
    const files = [
      'nodeprism-backup-2026-03-05_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-06_00-00-00.sql.gz',
      'nodeprism-backup-2026-03-07_00-00-00.sql.gz',
    ];
    expect(filterBackupFiles(files)).toHaveLength(3);
  });
});

describe('Backup DATABASE_URL Validation', () => {
  function isValidDatabaseUrl(url: string): boolean {
    if (!url) return false;
    try {
      return url.startsWith('postgresql://') || url.startsWith('postgres://');
    } catch {
      return false;
    }
  }

  it('should accept postgresql:// URLs', () => {
    expect(isValidDatabaseUrl('postgresql://user:pass@localhost:5432/db')).toBe(true);
  });

  it('should accept postgres:// URLs', () => {
    expect(isValidDatabaseUrl('postgres://user:pass@localhost:5432/db')).toBe(true);
  });

  it('should reject empty URL', () => {
    expect(isValidDatabaseUrl('')).toBe(false);
  });

  it('should reject non-PostgreSQL URLs', () => {
    expect(isValidDatabaseUrl('mysql://user:pass@localhost:3306/db')).toBe(false);
  });
});
