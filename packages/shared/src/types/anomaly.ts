/**
 * Anomaly Detection Types
 * Based on Netdata's ML-powered anomaly detection approach
 */

/**
 * Anomaly score for a single metric
 */
export interface AnomalyScore {
  metricName: string;
  serverId: string;
  score: number; // 0-100, higher = more anomalous
  isAnomalous: boolean;
  timestamp: Date;
  modelCount: number;
  consensusRequired: number;
  consensusAchieved: number;
}

/**
 * Node Anomaly Rate (NAR) - percentage of anomalous metrics on a server
 */
export interface NodeAnomalyRate {
  serverId: string;
  rate: number; // 0-100 percentage
  anomalousCount: number;
  totalCount: number;
  timestamp: Date;
}

/**
 * Anomaly event stored in the database
 */
export interface AnomalyEvent {
  id: string;
  serverId: string;
  metricName: string;
  score: number;
  startedAt: Date;
  endedAt?: Date | null;
  severity: number; // Percentage of metrics anomalous
  createdAt: Date;
}

/**
 * K-means model data stored for anomaly detection
 */
export interface AnomalyModelData {
  centroids: number[][];
  threshold: number;
  trainedAt: Date;
  dataPoints: number;
  windowSize: number;
}

/**
 * Stored model with metadata
 */
export interface StoredAnomalyModel {
  id: string;
  serverId: string;
  metricName: string;
  clusterCenters: AnomalyModelData;
  threshold: number;
  trainedAt: Date;
  expiresAt: Date;
}

/**
 * Anomaly detection configuration
 */
export interface AnomalyConfig {
  enabled: boolean;
  trainingIntervalMs: number;
  scoringIntervalMs: number;
  modelMaxAgeHours: number;
  minDataPointsForTraining: number;
  consensusRequired: boolean;
}

/**
 * API response for anomaly list
 */
export interface AnomaliesResponse {
  success: boolean;
  data: AnomalyScore[];
  count: number;
}

/**
 * API response for anomaly rates
 */
export interface AnomalyRatesResponse {
  success: boolean;
  data: NodeAnomalyRate[];
}

/**
 * API response for anomaly stats
 */
export interface AnomalyStatsResponse {
  success: boolean;
  data: {
    totalModels: number;
    uniqueMetrics: number;
    totalScores: number;
    anomalousScores: number;
    serverCount: number;
  };
}
