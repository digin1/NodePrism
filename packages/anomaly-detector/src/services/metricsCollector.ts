import axios from 'axios';
import { DEFAULT_MONITORED_METRICS, MonitoredMetricDefinition } from '@nodeprism/shared';
import { logger } from '../utils/logger';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

export interface MetricInfo {
  metricKey: string;
  baseName: string;
  serverId: string;
  labels: Record<string, string>;
  definition: MonitoredMetricDefinition;
}

export interface CurrentMetric {
  metricKey: string;
  baseName: string;
  serverId: string;
  value: number;
  timestamp: Date;
  definition: MonitoredMetricDefinition;
  labels: Record<string, string>;
}

export class MetricsCollector {
  /**
   * Get list of metrics that should be trained for anomaly detection
   */
  async getTrainableMetrics(): Promise<MetricInfo[]> {
    const metrics: MetricInfo[] = [];

    try {
      // Query Prometheus for available series
      for (const metricDef of DEFAULT_MONITORED_METRICS) {
        const query = metricDef.promql || metricDef.name;

        const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
          params: { query },
        });

        const results = response.data?.data?.result || [];

        for (const result of results) {
          const labels = result.metric || {};
          const serverId = labels.server_id || labels.instance || 'unknown';
          const metricKey = this.buildMetricKey(metricDef, labels);

          metrics.push({
            metricKey,
            baseName: metricDef.name,
            serverId,
            labels,
            definition: metricDef,
          });
        }
      }

      // Deduplicate by metricKey+serverId
      const uniqueMetrics = new Map<string, MetricInfo>();
      for (const metric of metrics) {
        const key = `${metric.metricKey}:${metric.serverId}`;
        if (!uniqueMetrics.has(key)) {
          uniqueMetrics.set(key, metric);
        }
      }

      return Array.from(uniqueMetrics.values());
    } catch (error) {
      logger.error('Failed to get trainable metrics', { error });
      return [];
    }
  }

  /**
   * Build a unique metric key including relevant labels
   */
  private buildMetricKey(
    metricDef: MonitoredMetricDefinition,
    labels: Record<string, string>
  ): string {
    if (metricDef.labelKey && labels[metricDef.labelKey]) {
      return `${metricDef.name}{${metricDef.labelKey}="${labels[metricDef.labelKey]}"}`;
    }
    return metricDef.name;
  }

  private buildQuery(
    definition: MonitoredMetricDefinition | undefined,
    baseMetricName: string
  ): string {
    const baseQuery = definition?.promql || baseMetricName;
    if (this.isCounterMetric(definition, baseMetricName)) {
      return `irate(${baseQuery}[1m])`;
    }
    return baseQuery;
  }

  private isCounterMetric(
    definition: MonitoredMetricDefinition | undefined,
    baseMetricName: string
  ): boolean {
    if (typeof definition?.isCounter === 'boolean') {
      return definition.isCounter;
    }
    return baseMetricName.endsWith('_total');
  }

  private addSelectorsToQuery(
    query: string,
    baseMetricName: string,
    serverId: string,
    labels: Record<string, string>,
    definition?: MonitoredMetricDefinition
  ): string {
    const selectorParts: string[] = [];

    if (serverId && serverId !== 'unknown') {
      selectorParts.push(`server_id="${serverId}"`);
    }

    if (definition?.labelKey && labels[definition.labelKey]) {
      selectorParts.push(`${definition.labelKey}="${labels[definition.labelKey]}"`);
    }

    if (selectorParts.length === 0) {
      return query;
    }

    const selector = `{${selectorParts.join(',')}}`;
    const baseMetric = definition?.promql || baseMetricName;

    if (query.includes(`${baseMetric}{`)) {
      return query;
    }

    const escapedMetric = baseMetric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(${escapedMetric})(?!\\{)`);
    return query.replace(pattern, `$1${selector}`);
  }

  /**
   * Fetch historical metric data for training
   */
  async fetchMetricData(metric: MetricInfo, durationSeconds: number): Promise<number[]> {
    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - durationSeconds;

      const query = this.buildQuery(metric.definition, metric.baseName);

      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query,
          start,
          end,
          step: '15s', // 15 second resolution
        },
      });

      const results = response.data?.data?.result || [];

      if (results.length === 0) {
        return [];
      }

      // Find the matching series
      const matchingResult = this.findMatchingSeries(results, metric.labels);

      if (!matchingResult) {
        return [];
      }

      // Extract values from the time series
      const values = matchingResult.values.map((v: [number, string]) => parseFloat(v[1]));

      // Filter out NaN and Infinity
      return values.filter((v: number) => isFinite(v) && !isNaN(v));
    } catch (error) {
      logger.error('Failed to fetch metric data', {
        metricKey: metric.metricKey,
        baseName: metric.baseName,
        error,
      });
      return [];
    }
  }

  /**
   * Find the series that matches the given labels
   */
  private findMatchingSeries(results: any[], labels: Record<string, string>): any | null {
    for (const result of results) {
      const resultLabels = result.metric || {};

      let matches = true;
      for (const [key, value] of Object.entries(labels)) {
        if (key !== '__name__' && resultLabels[key] !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return result;
      }
    }

    // If no exact match, return the first result
    return results[0] || null;
  }

  /**
   * Fetch current metric values for scoring
   */
  async fetchCurrentMetrics(): Promise<CurrentMetric[]> {
    const metrics: CurrentMetric[] = [];

    try {
      for (const metricDef of DEFAULT_MONITORED_METRICS) {
        const query = this.buildQuery(metricDef, metricDef.name);

        const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
          params: { query },
        });

        const results = response.data?.data?.result || [];

        for (const result of results) {
          const labels = result.metric || {};
          const serverId = labels.server_id || labels.instance || 'unknown';
          const value = parseFloat(result.value?.[1] || '0');

          if (isFinite(value) && !isNaN(value)) {
            const metricKey = this.buildMetricKey(metricDef, labels);

            metrics.push({
              metricKey,
              baseName: metricDef.name,
              serverId,
              value,
              timestamp: new Date(),
              definition: metricDef,
              labels,
            });
          }
        }
      }

      return metrics;
    } catch (error) {
      logger.error('Failed to fetch current metrics', { error });
      return [];
    }
  }

  /**
   * Fetch recent data for a specific metric (for scoring)
   */
  async fetchRecentData(
    metricKey: string,
    baseMetricName: string,
    serverId: string,
    labels: Record<string, string>,
    windowMinutes: number = 5,
    definition?: MonitoredMetricDefinition
  ): Promise<number[]> {
    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - windowMinutes * 60;

      let query = this.buildQuery(definition, baseMetricName);
      query = this.addSelectorsToQuery(query, baseMetricName, serverId, labels, definition);

      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query,
          start,
          end,
          step: '15s',
        },
      });

      const results = response.data?.data?.result || [];

      if (results.length === 0) {
        return [];
      }

      const values = results[0].values.map((v: [number, string]) => parseFloat(v[1]));
      return values.filter((v: number) => isFinite(v) && !isNaN(v));
    } catch (error) {
      logger.debug('Failed to fetch recent data', { metricKey, serverId });
      return [];
    }
  }
}
