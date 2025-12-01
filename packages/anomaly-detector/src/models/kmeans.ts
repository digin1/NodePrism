import { kmeans } from 'ml-kmeans';
import * as ss from 'simple-statistics';
import { logger } from '../utils/logger';

export interface KMeansModelData {
  centroids: number[][];
  threshold: number;
  trainedAt: Date;
  dataPoints: number;
  windowSize: number;
}

export interface FeatureVector {
  values: number[];
  timestamp: Date;
}

/**
 * K-Means based anomaly detection model
 * Inspired by Netdata's ML implementation
 */
export class KMeansAnomalyModel {
  private centroids: number[][] = [];
  private threshold: number = 0;
  private trainedAt: Date | null = null;
  private dataPoints: number = 0;

  // Feature extraction parameters
  private readonly windowSize: number = 6; // 6 data points per feature vector
  private readonly k: number = 2; // 2 clusters as per Netdata

  /**
   * Extract feature vectors from raw time series data
   * Creates sliding windows of normalized values
   */
  extractFeatures(data: number[]): FeatureVector[] {
    if (data.length < this.windowSize) {
      return [];
    }

    const features: FeatureVector[] = [];

    // Normalize the data
    const mean = ss.mean(data);
    const stdDev = ss.standardDeviation(data) || 1;
    const normalized = data.map((v) => (v - mean) / stdDev);

    // Create sliding windows
    for (let i = 0; i <= normalized.length - this.windowSize; i++) {
      const window = normalized.slice(i, i + this.windowSize);
      features.push({
        values: window,
        timestamp: new Date(),
      });
    }

    return features;
  }

  /**
   * Train the K-means model on feature vectors
   */
  train(data: number[]): KMeansModelData | null {
    try {
      const features = this.extractFeatures(data);

      if (features.length < this.k * 10) {
        logger.debug('Insufficient feature vectors for training');
        return null;
      }

      // Extract just the values for clustering
      const featureMatrix = features.map((f) => f.values);

      // Run K-means clustering
      const result = kmeans(featureMatrix, this.k, {
        initialization: 'kmeans++',
        maxIterations: 100,
      });

      this.centroids = result.centroids;
      this.trainedAt = new Date();
      this.dataPoints = data.length;

      // Calculate distances to centroids for all training points
      const distances = featureMatrix.map((point) => this.minDistanceToCentroid(point));

      // Set threshold at 99th percentile of distances
      this.threshold = ss.quantile(distances, 0.99);

      logger.debug('Model trained', {
        centroids: this.centroids.length,
        threshold: this.threshold,
        dataPoints: this.dataPoints,
      });

      return this.toJSON();

    } catch (error) {
      logger.error('Failed to train K-means model', { error });
      return null;
    }
  }

  /**
   * Calculate the minimum Euclidean distance from a point to any centroid
   */
  private minDistanceToCentroid(point: number[]): number {
    let minDist = Infinity;

    for (const centroid of this.centroids) {
      const dist = this.euclideanDistance(point, centroid);
      if (dist < minDist) {
        minDist = dist;
      }
    }

    return minDist;
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }

    return Math.sqrt(sum);
  }

  /**
   * Score a new data window for anomalies
   * Returns a score between 0-100 where higher = more anomalous
   */
  score(recentData: number[]): { score: number; isAnomalous: boolean } | null {
    if (this.centroids.length === 0 || !this.trainedAt) {
      return null;
    }

    const features = this.extractFeatures(recentData);

    if (features.length === 0) {
      return null;
    }

    // Use the most recent feature vector
    const latestFeature = features[features.length - 1];
    const distance = this.minDistanceToCentroid(latestFeature.values);

    // Convert distance to 0-100 score
    // Score = 0 means exactly at centroid, 100 means way beyond threshold
    const normalizedScore = Math.min(100, (distance / this.threshold) * 100);

    return {
      score: normalizedScore,
      isAnomalous: distance > this.threshold,
    };
  }

  /**
   * Load model from stored data
   */
  loadFromJSON(data: KMeansModelData): void {
    this.centroids = data.centroids;
    this.threshold = data.threshold;
    this.trainedAt = new Date(data.trainedAt);
    this.dataPoints = data.dataPoints;
  }

  /**
   * Export model data for storage
   */
  toJSON(): KMeansModelData {
    return {
      centroids: this.centroids,
      threshold: this.threshold,
      trainedAt: this.trainedAt || new Date(),
      dataPoints: this.dataPoints,
      windowSize: this.windowSize,
    };
  }

  /**
   * Check if model is trained and valid
   */
  isValid(): boolean {
    return this.centroids.length > 0 && this.trainedAt !== null;
  }

  /**
   * Check if model is expired (older than specified hours)
   */
  isExpired(maxAgeHours: number = 24): boolean {
    if (!this.trainedAt) return true;

    const ageMs = Date.now() - this.trainedAt.getTime();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    return ageMs > maxAgeMs;
  }
}
