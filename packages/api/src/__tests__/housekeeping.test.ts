describe('Housekeeping - Disk Pressure', () => {
  // Mirrors getRetentionMultiplier() from services/housekeeping.ts
  function getRetentionMultiplier(usedPercent: number): number {
    if (usedPercent < 75) return 1.0;
    if (usedPercent >= 90) return 0.25;
    // Linear scale between 75% and 90%
    return 1.0 - ((usedPercent - 75) / 15) * 0.75;
  }

  it('should return 1.0 for normal disk usage (<75%)', () => {
    expect(getRetentionMultiplier(0)).toBe(1.0);
    expect(getRetentionMultiplier(50)).toBe(1.0);
    expect(getRetentionMultiplier(74)).toBe(1.0);
  });

  it('should return 0.25 for critical disk usage (>=90%)', () => {
    expect(getRetentionMultiplier(90)).toBe(0.25);
    expect(getRetentionMultiplier(95)).toBe(0.25);
    expect(getRetentionMultiplier(100)).toBe(0.25);
  });

  it('should scale linearly between 75% and 90%', () => {
    const at75 = getRetentionMultiplier(75);
    const at82 = getRetentionMultiplier(82.5);
    const at89 = getRetentionMultiplier(89);

    expect(at75).toBe(1.0);
    expect(at82).toBeCloseTo(0.625, 2);
    expect(at89).toBeCloseTo(0.3, 1);
  });

  it('should always be between 0.25 and 1.0', () => {
    for (let i = 0; i <= 100; i++) {
      const multiplier = getRetentionMultiplier(i);
      expect(multiplier).toBeGreaterThanOrEqual(0.25);
      expect(multiplier).toBeLessThanOrEqual(1.0);
    }
  });
});

describe('Housekeeping - Retention Calculation', () => {
  function calculateRetentionDays(baseDays: number, multiplier: number): number {
    return Math.max(1, Math.round(baseDays * multiplier));
  }

  it('should use full retention at normal disk usage', () => {
    expect(calculateRetentionDays(30, 1.0)).toBe(30);
    expect(calculateRetentionDays(14, 1.0)).toBe(14);
    expect(calculateRetentionDays(90, 1.0)).toBe(90);
  });

  it('should reduce retention under disk pressure', () => {
    expect(calculateRetentionDays(30, 0.5)).toBe(15);
    expect(calculateRetentionDays(14, 0.5)).toBe(7);
  });

  it('should use aggressive retention at critical disk', () => {
    expect(calculateRetentionDays(30, 0.25)).toBe(8);
    expect(calculateRetentionDays(14, 0.25)).toBe(4);
    expect(calculateRetentionDays(90, 0.25)).toBe(23);
  });

  it('should never go below 1 day', () => {
    expect(calculateRetentionDays(1, 0.25)).toBe(1);
    expect(calculateRetentionDays(2, 0.25)).toBe(1);
  });
});

describe('Housekeeping - Disk Usage Parsing', () => {
  // Mirrors getDiskUsage() parsing logic from services/housekeeping.ts
  function parseDfOutput(output: string): { totalGB: number; usedGB: number; availGB: number; usedPercent: number } | null {
    const lines = output.trim().split('\n');
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    if (parts.length < 5) return null;

    const totalGB = parseInt(parts[1].replace('G', ''));
    const usedGB = parseInt(parts[2].replace('G', ''));
    const availGB = parseInt(parts[3].replace('G', ''));
    const usedPercent = parseInt(parts[4].replace('%', ''));

    if (isNaN(totalGB) || isNaN(usedGB) || isNaN(availGB) || isNaN(usedPercent)) return null;

    return { totalGB, usedGB, availGB, usedPercent };
  }

  it('should parse standard df -BG output', () => {
    const output = `Filesystem      1G-blocks  Used Available Use% Mounted on
/dev/sda1            100G   45G       55G  45% /`;
    const result = parseDfOutput(output);
    expect(result).toEqual({ totalGB: 100, usedGB: 45, availGB: 55, usedPercent: 45 });
  });

  it('should parse high usage output', () => {
    const output = `Filesystem      1G-blocks  Used Available Use% Mounted on
/dev/vda1             50G   48G        2G  96% /`;
    const result = parseDfOutput(output);
    expect(result).toEqual({ totalGB: 50, usedGB: 48, availGB: 2, usedPercent: 96 });
  });

  it('should return null for invalid output', () => {
    expect(parseDfOutput('')).toBeNull();
    expect(parseDfOutput('single line')).toBeNull();
  });
});
