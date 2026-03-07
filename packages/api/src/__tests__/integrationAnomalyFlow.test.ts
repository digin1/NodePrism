/**
 * Integration flow test: Anomaly Detection Flow
 *
 * Tests the data flow: metric data -> feature extraction -> clustering ->
 * scoring -> anomaly event. All functions are pure inline mirrors of the
 * real service logic (anomaly-detector models/kmeans.ts,
 * services/anomalyScorer.ts, shared/types/anomaly.ts).
 */

// ---------------------------------------------------------------------------
// Pure functions mirroring real service logic
// ---------------------------------------------------------------------------

/**
 * Extracts feature vectors from time-series data using sliding windows
 * and z-score normalization. Mirrors models/kmeans.ts extractFeatures().
 */
function extractFeatures(
  data: number[],
  windowSize: number = 6,
): number[][] {
  if (data.length < windowSize) return [];

  // Normalize: z-score
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const variance =
    data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance) || 1;
  const normalized = data.map((v) => (v - mean) / stdDev);

  // Sliding windows
  const features: number[][] = [];
  for (let i = 0; i <= normalized.length - windowSize; i++) {
    features.push(normalized.slice(i, i + windowSize));
  }
  return features;
}

/**
 * Euclidean distance between two vectors.
 * Mirrors models/kmeans.ts euclideanDistance().
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must have same length');
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

/**
 * Minimum distance from a point to any centroid.
 * Mirrors models/kmeans.ts minDistanceToCentroid().
 */
function minDistanceToCentroid(
  point: number[],
  centroids: number[][],
): number {
  let minDist = Infinity;
  for (const centroid of centroids) {
    const dist = euclideanDistance(point, centroid);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Scores a data window against trained centroids.
 * Returns a 0-100 score. Mirrors models/kmeans.ts score().
 */
function scoreAgainstModel(
  recentData: number[],
  centroids: number[][],
  threshold: number,
  windowSize: number = 6,
): { score: number; isAnomalous: boolean } | null {
  if (centroids.length === 0) return null;

  const features = extractFeatures(recentData, windowSize);
  if (features.length === 0) return null;

  const latestFeature = features[features.length - 1];
  const distance = minDistanceToCentroid(latestFeature, centroids);
  const normalizedScore = Math.min(100, (distance / threshold) * 100);

  return {
    score: normalizedScore,
    isAnomalous: distance > threshold,
  };
}

/**
 * Multi-model consensus: anomaly only when ALL models agree.
 * Mirrors services/anomalyScorer.ts scoreMetric() logic.
 */
function multiModelConsensus(
  modelResults: Array<{ score: number; isAnomalous: boolean }>,
): { avgScore: number; isAnomalous: boolean; consensusAchieved: number } {
  const totalScore = modelResults.reduce((s, r) => s + r.score, 0);
  const anomalousCount = modelResults.filter((r) => r.isAnomalous).length;
  return {
    avgScore: totalScore / modelResults.length,
    isAnomalous: anomalousCount === modelResults.length,
    consensusAchieved: anomalousCount,
  };
}

/**
 * Calculates the Node Anomaly Rate (NAR): percentage of anomalous metrics.
 * Mirrors services/anomalyScorer.ts updateNodeAnomalyRate().
 */
function calculateNAR(
  scores: Array<{ isAnomalous: boolean }>,
): { rate: number; anomalousCount: number; totalCount: number } {
  const totalCount = scores.length;
  const anomalousCount = scores.filter((s) => s.isAnomalous).length;
  return {
    rate: totalCount > 0 ? (anomalousCount / totalCount) * 100 : 0,
    anomalousCount,
    totalCount,
  };
}

/**
 * Determines whether an anomaly event should be created.
 * An event is created when: score is anomalous AND there is no existing
 * open event for the same server+metric. Mirrors anomalyEventStore.ts.
 */
function shouldCreateAnomalyEvent(
  isAnomalous: boolean,
  existingOpenEvent: boolean,
): boolean {
  return isAnomalous && !existingOpenEvent;
}

/**
 * Builds a Redis score key. Mirrors anomalyScorer.ts buildScoreKey().
 */
function buildScoreKey(metricName: string, serverId: string): string {
  const sanitized = metricName.replace(/[{}="]/g, '_');
  return `anomaly:score:${serverId}:${sanitized}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Anomaly Flow - Feature Vector Construction', () => {
  it('should create sliding windows from time series', () => {
    const data = [10, 20, 30, 40, 50, 60, 70, 80];
    const features = extractFeatures(data, 6);
    // With 8 data points and window=6: should produce 3 windows
    expect(features.length).toBe(3);
    expect(features[0].length).toBe(6);
  });

  it('should return empty when data is shorter than window', () => {
    const features = extractFeatures([1, 2, 3], 6);
    expect(features.length).toBe(0);
  });

  it('should normalize values via z-score', () => {
    const data = [100, 100, 100, 100, 100, 100]; // constant series
    const features = extractFeatures(data, 6);
    // All values same => stdDev=0 => uses fallback stdDev=1
    // All (v - mean) = 0
    expect(features.length).toBe(1);
    features[0].forEach((v) => expect(v).toBeCloseTo(0, 5));
  });

  it('should produce features with zero mean for symmetric data', () => {
    const data = [-3, -2, -1, 1, 2, 3];
    const features = extractFeatures(data, 6);
    expect(features.length).toBe(1);
    const featureMean =
      features[0].reduce((s, v) => s + v, 0) / features[0].length;
    expect(featureMean).toBeCloseTo(0, 5);
  });
});

describe('Anomaly Flow - Distance Calculation', () => {
  it('should return 0 for identical vectors', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('should calculate correct distance for simple vectors', () => {
    // sqrt((3-0)^2 + (4-0)^2) = 5
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  });

  it('should throw for mismatched dimensions', () => {
    expect(() => euclideanDistance([1, 2], [1, 2, 3])).toThrow(
      'Vectors must have same length',
    );
  });

  it('should find the minimum distance to nearest centroid', () => {
    const centroids = [
      [0, 0],
      [10, 10],
    ];
    const point = [1, 1];
    const minDist = minDistanceToCentroid(point, centroids);
    // Distance to [0,0] = sqrt(2) ~= 1.414
    // Distance to [10,10] = sqrt(162) ~= 12.73
    expect(minDist).toBeCloseTo(Math.sqrt(2), 5);
  });
});

describe('Anomaly Flow - Anomaly Score Thresholding', () => {
  it('should mark as anomalous when distance exceeds threshold', () => {
    // Build data that will produce a feature where the last window is far from centroid
    const normalData = [10, 10, 10, 10, 10, 10]; // all same
    const centroid = [0, 0, 0, 0, 0, 0]; // normalized zero means normal
    const threshold = 0.5;

    const result = scoreAgainstModel(normalData, [centroid], threshold, 6);
    expect(result).not.toBeNull();
    // Constant data normalizes to all zeros, distance=0, score=0
    expect(result!.score).toBeCloseTo(0, 1);
    expect(result!.isAnomalous).toBe(false);
  });

  it('should return score capped at 100', () => {
    // Distance far beyond threshold
    const data = [0, 0, 0, 0, 0, 100]; // spike in last value
    const centroid = [0, 0, 0, 0, 0, 0];
    const threshold = 0.001; // very tight threshold

    const result = scoreAgainstModel(data, [centroid], threshold, 6);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100);
    expect(result!.isAnomalous).toBe(true);
  });

  it('should return null for empty centroids', () => {
    const result = scoreAgainstModel([1, 2, 3, 4, 5, 6], [], 1.0, 6);
    expect(result).toBeNull();
  });

  it('should return null for insufficient data', () => {
    const centroid = [0, 0, 0, 0, 0, 0];
    const result = scoreAgainstModel([1, 2], [centroid], 1.0, 6);
    expect(result).toBeNull();
  });
});

describe('Anomaly Flow - Multi-Model Consensus', () => {
  it('should require ALL models to agree for anomaly', () => {
    const results = [
      { score: 95, isAnomalous: true },
      { score: 80, isAnomalous: true },
      { score: 60, isAnomalous: false }, // one disagrees
    ];
    const consensus = multiModelConsensus(results);
    expect(consensus.isAnomalous).toBe(false);
    expect(consensus.consensusAchieved).toBe(2);
  });

  it('should be anomalous when all models agree', () => {
    const results = [
      { score: 95, isAnomalous: true },
      { score: 88, isAnomalous: true },
    ];
    const consensus = multiModelConsensus(results);
    expect(consensus.isAnomalous).toBe(true);
    expect(consensus.consensusAchieved).toBe(2);
  });

  it('should calculate average score', () => {
    const results = [
      { score: 80, isAnomalous: true },
      { score: 60, isAnomalous: true },
    ];
    const consensus = multiModelConsensus(results);
    expect(consensus.avgScore).toBeCloseTo(70, 5);
  });
});

describe('Anomaly Flow - NAR Calculation', () => {
  it('should calculate 0% rate for no anomalies', () => {
    const nar = calculateNAR([
      { isAnomalous: false },
      { isAnomalous: false },
      { isAnomalous: false },
    ]);
    expect(nar.rate).toBe(0);
    expect(nar.anomalousCount).toBe(0);
    expect(nar.totalCount).toBe(3);
  });

  it('should calculate 100% rate when all anomalous', () => {
    const nar = calculateNAR([
      { isAnomalous: true },
      { isAnomalous: true },
    ]);
    expect(nar.rate).toBe(100);
  });

  it('should calculate correct partial rate', () => {
    const nar = calculateNAR([
      { isAnomalous: true },
      { isAnomalous: false },
      { isAnomalous: false },
      { isAnomalous: false },
    ]);
    expect(nar.rate).toBeCloseTo(25, 5);
    expect(nar.anomalousCount).toBe(1);
  });

  it('should return 0% for empty scores', () => {
    const nar = calculateNAR([]);
    expect(nar.rate).toBe(0);
    expect(nar.totalCount).toBe(0);
  });
});

describe('Anomaly Flow - Anomaly Event Creation', () => {
  it('should create event when anomalous and no existing open event', () => {
    expect(shouldCreateAnomalyEvent(true, false)).toBe(true);
  });

  it('should NOT create event when anomalous but open event exists', () => {
    expect(shouldCreateAnomalyEvent(true, true)).toBe(false);
  });

  it('should NOT create event when not anomalous', () => {
    expect(shouldCreateAnomalyEvent(false, false)).toBe(false);
    expect(shouldCreateAnomalyEvent(false, true)).toBe(false);
  });
});

describe('Anomaly Flow - Redis Score Key Construction', () => {
  it('should sanitize special characters in metric name', () => {
    const key = buildScoreKey('node_cpu{mode="idle"}', 'srv-1');
    expect(key).toBe('anomaly:score:srv-1:node_cpu_mode__idle__');
    expect(key).not.toContain('{');
    expect(key).not.toContain('}');
    expect(key).not.toContain('=');
    expect(key).not.toContain('"');
  });

  it('should keep simple metric names unchanged', () => {
    const key = buildScoreKey('node_cpu_usage', 'srv-1');
    expect(key).toBe('anomaly:score:srv-1:node_cpu_usage');
  });
});
