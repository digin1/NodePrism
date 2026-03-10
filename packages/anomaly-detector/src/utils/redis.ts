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
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this._connected = false;
      logger.debug('Redis set failed', { error: (error as Error).message });
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this._connected) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis get failed', { error: (error as Error).message });
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this._connected) return;
    try {
      await this.client.del(key);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis del failed', { error: (error as Error).message });
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this._connected) return [];
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis keys failed', { error: (error as Error).message });
      return [];
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client || !this._connected) return;
    try {
      await this.client.hset(key, field, value);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis hset failed', { error: (error as Error).message });
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client || !this._connected) return null;
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis hget failed', { error: (error as Error).message });
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client || !this._connected) return {};
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis hgetall failed', { error: (error as Error).message });
      return {};
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client || !this._connected) return;
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      this._connected = false;
      logger.debug('Redis expire failed', { error: (error as Error).message });
    }
  }
}
