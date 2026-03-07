import Redis from 'ioredis';
import { logger } from './logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export class RedisClient {
  private client: Redis | null = null;
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true,
      });

      this.client.on('error', (error) => {
        this._connected = false;
        logger.error('Redis connection error', { error: error.message });
      });

      this.client.on('connect', () => {
        this._connected = true;
        logger.info('Connected to Redis');
      });

      this.client.on('close', () => {
        this._connected = false;
      });

      await this.client.connect();
      this._connected = true;
    } catch (error) {
      this._connected = false;
      logger.warn('Redis connection failed — running in DB-only mode', { error: (error as Error).message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this._connected) return;

    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this._connected) return null;
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this._connected) return;
    await this.client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this._connected) return [];
    return this.client.keys(pattern);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client || !this._connected) return;
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client || !this._connected) return null;
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client || !this._connected) return {};
    return this.client.hgetall(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client || !this._connected) return;
    await this.client.expire(key, seconds);
  }
}
