import axios from 'axios';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

interface PrometheusTarget {
  labels: Record<string, string>;
  scrapeUrl: string;
  health: 'up' | 'down' | 'unknown';
  lastScrape: string;
  lastError?: string;
}

interface PrometheusTargetsResponse {
  status: string;
  data: {
    activeTargets: Array<{
      labels: Record<string, string>;
      discoveredLabels: Record<string, string>;
      scrapeUrl: string;
      health: string;
      lastScrape: string;
      lastError?: string;
    }>;
  };
}

export class PrometheusClient {
  private baseUrl: string;

  constructor(baseUrl: string = PROMETHEUS_URL) {
    this.baseUrl = baseUrl;
  }

  async getTargets(): Promise<PrometheusTarget[]> {
    try {
      const response = await axios.get<PrometheusTargetsResponse>(
        `${this.baseUrl}/api/v1/targets`
      );

      if (response.data.status !== 'success') {
        throw new Error('Failed to fetch targets from Prometheus');
      }

      return response.data.data.activeTargets.map((target) => ({
        // Merge discoveredLabels and labels (labels take priority)
        labels: { ...target.discoveredLabels, ...target.labels },
        scrapeUrl: target.scrapeUrl,
        health: target.health as 'up' | 'down' | 'unknown',
        lastScrape: target.lastScrape,
        lastError: target.lastError,
      }));
    } catch (error) {
      console.error('Error fetching Prometheus targets:', error);
      return [];
    }
  }

  async query(promql: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/query`, {
        params: { query: promql },
      });

      if (response.data.status !== 'success') {
        throw new Error(`PromQL query failed: ${promql}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Error executing PromQL query:', error);
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/-/healthy`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
