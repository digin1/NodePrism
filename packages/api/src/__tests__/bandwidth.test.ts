describe('Bandwidth Formatting', () => {
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
  }

  function formatRate(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
  }

  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(1073741824)).toBe('1.00 GB');
    expect(formatBytes(1099511627776)).toBe('1.00 TB');
  });

  it('should format rates correctly', () => {
    expect(formatRate(100)).toBe('100 B/s');
    expect(formatRate(2048)).toBe('2.0 KB/s');
    expect(formatRate(1048576)).toBe('1.00 MB/s');
    expect(formatRate(10485760)).toBe('10.00 MB/s');
  });
});

describe('Bandwidth Summary Calculation', () => {
  interface BandwidthData {
    totalIn: number;
    totalOut: number;
    avgIn: number;
    avgOut: number;
  }

  function calculateBandwidthSummary(
    metrics: { metricName: string; value: number }[],
    collectionInterval: number
  ): BandwidthData {
    const inMetrics = metrics.filter(m => m.metricName === 'networkIn');
    const outMetrics = metrics.filter(m => m.metricName === 'networkOut');

    const sumIn = inMetrics.reduce((acc, m) => acc + m.value, 0);
    const sumOut = outMetrics.reduce((acc, m) => acc + m.value, 0);
    const avgIn = inMetrics.length > 0 ? sumIn / inMetrics.length : 0;
    const avgOut = outMetrics.length > 0 ? sumOut / outMetrics.length : 0;

    return {
      totalIn: sumIn * collectionInterval,
      totalOut: sumOut * collectionInterval,
      avgIn,
      avgOut,
    };
  }

  it('should calculate totals from rate metrics', () => {
    const metrics = [
      { metricName: 'networkIn', value: 1000 },  // 1000 B/s
      { metricName: 'networkIn', value: 2000 },  // 2000 B/s
      { metricName: 'networkOut', value: 500 },
      { metricName: 'networkOut', value: 800 },
    ];
    const result = calculateBandwidthSummary(metrics, 60);
    expect(result.totalIn).toBe(180000);   // (1000+2000) * 60
    expect(result.totalOut).toBe(78000);   // (500+800) * 60
    expect(result.avgIn).toBe(1500);
    expect(result.avgOut).toBe(650);
  });

  it('should handle empty metrics', () => {
    const result = calculateBandwidthSummary([], 60);
    expect(result.totalIn).toBe(0);
    expect(result.totalOut).toBe(0);
    expect(result.avgIn).toBe(0);
    expect(result.avgOut).toBe(0);
  });

  it('should handle only inbound traffic', () => {
    const metrics = [
      { metricName: 'networkIn', value: 5000 },
    ];
    const result = calculateBandwidthSummary(metrics, 30);
    expect(result.totalIn).toBe(150000);
    expect(result.totalOut).toBe(0);
  });
});

describe('Top-N Bandwidth Ranking', () => {
  interface ServerBandwidth {
    id: string;
    hostname: string;
    totalIn: number;
    totalOut: number;
    totalBandwidth: number;
  }

  function rankByBandwidth(servers: ServerBandwidth[], limit: number): ServerBandwidth[] {
    return [...servers]
      .sort((a, b) => b.totalBandwidth - a.totalBandwidth)
      .slice(0, limit)
      .filter(s => s.totalBandwidth > 0);
  }

  const servers: ServerBandwidth[] = [
    { id: '1', hostname: 'web-1', totalIn: 5000000, totalOut: 3000000, totalBandwidth: 8000000 },
    { id: '2', hostname: 'web-2', totalIn: 2000000, totalOut: 1000000, totalBandwidth: 3000000 },
    { id: '3', hostname: 'db-1', totalIn: 100000, totalOut: 50000, totalBandwidth: 150000 },
    { id: '4', hostname: 'cdn-1', totalIn: 50000000, totalOut: 80000000, totalBandwidth: 130000000 },
    { id: '5', hostname: 'idle', totalIn: 0, totalOut: 0, totalBandwidth: 0 },
  ];

  it('should rank by total bandwidth descending', () => {
    const result = rankByBandwidth(servers, 10);
    expect(result[0].hostname).toBe('cdn-1');
    expect(result[1].hostname).toBe('web-1');
    expect(result[2].hostname).toBe('web-2');
    expect(result[3].hostname).toBe('db-1');
  });

  it('should exclude servers with zero bandwidth', () => {
    const result = rankByBandwidth(servers, 10);
    expect(result.find(s => s.hostname === 'idle')).toBeUndefined();
    expect(result).toHaveLength(4);
  });

  it('should respect limit parameter', () => {
    const result = rankByBandwidth(servers, 2);
    expect(result).toHaveLength(2);
    expect(result[0].hostname).toBe('cdn-1');
    expect(result[1].hostname).toBe('web-1');
  });

  it('should handle empty server list', () => {
    expect(rankByBandwidth([], 10)).toEqual([]);
  });
});

describe('Period Configuration', () => {
  const PERIOD_MS: Record<string, number> = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };

  it('should have correct period durations', () => {
    expect(PERIOD_MS.hour).toBe(3600000);
    expect(PERIOD_MS.day).toBe(86400000);
    expect(PERIOD_MS.week).toBe(604800000);
    expect(PERIOD_MS.month).toBe(2592000000);
  });

  it('should calculate correct start times', () => {
    const now = Date.now();
    for (const [period, ms] of Object.entries(PERIOD_MS)) {
      const start = new Date(now - ms);
      expect(now - start.getTime()).toBe(ms);
    }
  });
});

describe('Bandwidth Bar Visualization', () => {
  function calculateBarWidth(bandwidth: number, maxBandwidth: number): number {
    if (maxBandwidth === 0) return 0;
    return (bandwidth / maxBandwidth) * 100;
  }

  it('should calculate relative bar widths', () => {
    expect(calculateBarWidth(100, 100)).toBe(100);
    expect(calculateBarWidth(50, 100)).toBe(50);
    expect(calculateBarWidth(25, 100)).toBe(25);
  });

  it('should handle top server always being 100%', () => {
    const topBandwidth = 130000000;
    expect(calculateBarWidth(topBandwidth, topBandwidth)).toBe(100);
  });

  it('should handle zero max bandwidth', () => {
    expect(calculateBarWidth(0, 0)).toBe(0);
  });
});
