import Redis from 'ioredis';
import { logger } from './logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const READY_STATES = new Set(['connect', 'ready']);

export class RedisClient {
  private client: Redis | null = null;
  private _connected = false;

  get isConnected(): boolean {
    return this._connected && this.client?.status === 'ready';
  }

  private markDisconnected(): void {
    this._connected = false;
  }

  private getUsableClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  async connect(): Promise<void> {
    try {
      if (this.client && READY_STATES.has(this.client.status)) {
        this._connected = true;
        return;
      }

      if (this.client) {
        try {
          await this.client.disconnect(false);
        } catch {
          // Ignore stale client teardown failures.
        }
        this.client = null;
      }

      this.client = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      this.client.on('error', (error) => {
        this.markDisconnected();
        logger.error('Redis connection error', { error: error.message });
      });

      this.client.on('connect', () => {
        logger.info('Redis socket connected');
      });

      this.client.on('ready', () => {
        this._connected = true;
        logger.info('Redis client ready');
      });

      this.client.on('close', () => {
        this.markDisconnected();
      });

      this.client.on('end', () => {
        this.markDisconnected();
      });

      this.client.on('reconnecting', (delay: number) => {
        this.markDisconnected();
        logger.warn('Redis reconnect scheduled', { delay });
      });

      await this.client.connect();
      this._connected = this.client.status === 'ready';
    } catch (error) {
      this.markDisconnected();
      logger.warn('Redis connection failed — running in DB-only mode', { error: (error as Error).message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      const client = this.client;
      this.client = null;
      this.markDisconnected();

      try {
        if (client.status === 'ready') {
          await client.quit();
        } else {
          client.disconnect(false);
        }
      } catch (error) {
        logger.warn('Redis disconnect failed', { error: (error as Error).message });
      }
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getUsableClient();
    if (!client) return;
    try {
      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, value);
      } else {
        await client.set(key, value);
      }
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis set failed', { error: (error as Error).message });
    }
  }

  async get(key: string): Promise<string | null> {
    const client = this.getUsableClient();
    if (!client) return null;
    try {
      return await client.get(key);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis get failed', { error: (error as Error).message });
      return null;
    }
  }

  async del(key: string): Promise<void> {
    const client = this.getUsableClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis del failed', { error: (error as Error).message });
    }
  }

  async keys(pattern: string): Promise<string[]> {
    const client = this.getUsableClient();
    if (!client) return [];
    try {
      return await client.keys(pattern);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis keys failed', { error: (error as Error).message });
      return [];
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    const client = this.getUsableClient();
    if (!client) return;
    try {
      await client.hset(key, field, value);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis hset failed', { error: (error as Error).message });
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    const client = this.getUsableClient();
    if (!client) return null;
    try {
      return await client.hget(key, field);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis hget failed', { error: (error as Error).message });
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const client = this.getUsableClient();
    if (!client) return {};
    try {
      return await client.hgetall(key);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis hgetall failed', { error: (error as Error).message });
      return {};
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    const client = this.getUsableClient();
    if (!client) return;
    try {
      await client.expire(key, seconds);
    } catch (error) {
      this.markDisconnected();
      logger.debug('Redis expire failed', { error: (error as Error).message });
    }
  }
}
