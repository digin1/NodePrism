describe('Metric Collection - Bandwidth Calculation', () => {
  // Mirrors getBandwidthSummary logic from metricCollector.ts
  function calculateBandwidth(
    dataPoints: { timestamp: number; value: number }[],
    periodSeconds: number
  ): { totalBytes: number; avgBytesPerSec: number } {
    if (dataPoints.length < 2) return { totalBytes: 0, avgBytesPerSec: 0 };

    // For counter metrics, bandwidth = last - first (monotonic increase)
    const first = dataPoints[0].value;
    const last = dataPoints[dataPoints.length - 1].value;
    const totalBytes = Math.max(0, last - first);
    const avgBytesPerSec = totalBytes / periodSeconds;

    return { totalBytes, avgBytesPerSec };
  }

  it('should calculate bandwidth from counter values', () => {
    const points = [
      { timestamp: 1000, value: 1000000 },
      { timestamp: 2000, value: 1500000 },
      { timestamp: 3000, value: 2000000 },
    ];
    const result = calculateBandwidth(points, 3600);
    expect(result.totalBytes).toBe(1000000);
    expect(result.avgBytesPerSec).toBeCloseTo(277.78, 1);
  });

  it('should handle counter reset (return 0)', () => {
    const points = [
      { timestamp: 1000, value: 5000000 },
      { timestamp: 2000, value: 100000 }, // counter reset
    ];
    const result = calculateBandwidth(points, 3600);
    expect(result.totalBytes).toBe(0); // max(0, negative) = 0
  });

  it('should handle single data point', () => {
    const points = [{ timestamp: 1000, value: 1000000 }];
    const result = calculateBandwidth(points, 3600);
    expect(result.totalBytes).toBe(0);
    expect(result.avgBytesPerSec).toBe(0);
  });

  it('should handle empty data', () => {
    const result = calculateBandwidth([], 3600);
    expect(result.totalBytes).toBe(0);
  });
});

describe('Metric Collection - Aggregation', () => {
  function aggregate(values: number[], method: 'avg' | 'min' | 'max' | 'sum'): number {
    if (values.length === 0) return 0;
    switch (method) {
      case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
      case 'sum': return values.reduce((a, b) => a + b, 0);
    }
  }

  it('should calculate average', () => {
    expect(aggregate([10, 20, 30], 'avg')).toBe(20);
  });

  it('should calculate min', () => {
    expect(aggregate([10, 5, 20], 'min')).toBe(5);
  });

  it('should calculate max', () => {
    expect(aggregate([10, 5, 20], 'max')).toBe(20);
  });

  it('should calculate sum', () => {
    expect(aggregate([10, 20, 30], 'sum')).toBe(60);
  });

  it('should return 0 for empty array', () => {
    expect(aggregate([], 'avg')).toBe(0);
    expect(aggregate([], 'sum')).toBe(0);
  });
});

describe('Metric Collection - CPU Usage Calculation', () => {
  // CPU usage from node_exporter: 100 - (idle_rate * 100)
  function calculateCpuUsage(idleRate: number): number {
    return Math.round((100 - idleRate * 100) * 100) / 100;
  }

  it('should calculate CPU usage from idle rate', () => {
    expect(calculateCpuUsage(0.95)).toBeCloseTo(5, 0);    // 5% usage
    expect(calculateCpuUsage(0.20)).toBeCloseTo(80, 0);   // 80% usage
    expect(calculateCpuUsage(0.0)).toBeCloseTo(100, 0);   // 100% usage
    expect(calculateCpuUsage(1.0)).toBeCloseTo(0, 0);     // 0% usage
  });
});

describe('Metric Collection - Memory Usage Calculation', () => {
  function calculateMemoryUsage(availableBytes: number, totalBytes: number): number {
    if (totalBytes === 0) return 0;
    return Math.round(((totalBytes - availableBytes) / totalBytes) * 10000) / 100;
  }

  it('should calculate memory percentage', () => {
    expect(calculateMemoryUsage(2e9, 8e9)).toBe(75); // 75% used
    expect(calculateMemoryUsage(8e9, 8e9)).toBe(0);  // 0% used
    expect(calculateMemoryUsage(0, 8e9)).toBe(100);   // 100% used
  });

  it('should handle zero total', () => {
    expect(calculateMemoryUsage(0, 0)).toBe(0);
  });
});
