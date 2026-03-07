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
  private consecutiveFailures = 0;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;

  constructor(baseUrl: string = PROMETHEUS_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Retry an operation with exponential backoff.
   */
  private async withRetry<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await operation();
        if (this.consecutiveFailures > 0) {
          console.log(`Prometheus recovered after ${this.consecutiveFailures} failures`);
        }
        this.consecutiveFailures = 0;
        return result;
      } catch (error) {
        if (attempt < this.MAX_RETRIES) {
          const delay = this.BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`Prometheus request failed (attempt ${attempt + 1}/${this.MAX_RETRIES + 1}), retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          this.consecutiveFailures++;
          console.error(`Prometheus unreachable after ${this.MAX_RETRIES + 1} attempts (consecutive failures: ${this.consecutiveFailures})`);
          return fallback;
        }
      }
    }
    return fallback;
  }

  async getTargets(): Promise<PrometheusTarget[]> {
    return this.withRetry(async () => {
      const response = await axios.get<PrometheusTargetsResponse>(
        `${this.baseUrl}/api/v1/targets`,
        { timeout: 5000 }
      );

      if (response.data.status !== 'success') {
        throw new Error('Failed to fetch targets from Prometheus');
      }

      return response.data.data.activeTargets.map((target) => ({
        labels: { ...target.discoveredLabels, ...target.labels },
        scrapeUrl: target.scrapeUrl,
        health: target.health as 'up' | 'down' | 'unknown',
        lastScrape: target.lastScrape,
        lastError: target.lastError,
      }));
    }, []);
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
