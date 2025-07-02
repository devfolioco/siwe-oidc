import { getConfig } from '../config.js';
import { Redis } from 'ioredis';

const KV_SESSION_PREFIX = 'sessions';

class RedisClient {
  private static instance: RedisClient;
  private client: Redis;

  private constructor() {
    this.client = new Redis(getConfig().REDIS.URL);

    this.client.on('error', (error) => {
      console.error('Redis Client Error:', error);
    });

    this.client.on('connect', () => {
      console.info('Redis Client Connected');
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  // public async connect(): Promise<void> {
  //   await this.client.connect();
  // }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
  }

  public async setSession(id: string, entry: any): Promise<void> {
    const key = `${KV_SESSION_PREFIX}/${id}`;
    const value = JSON.stringify(entry);
    const sessionLifetime = 300; // 5 minutes in seconds

    await this.set(key, value, sessionLifetime);
  }

  public async getSession(id: string): Promise<any | null> {
    const key = `${KV_SESSION_PREFIX}/${id}`;
    const result = await this.get(key);

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result);
    } catch (error) {
      console.error('Error parsing session data:', error);
      return null;
    }
  }

  public async setCode(code: string, codeEntry: any): Promise<void> {
    const serializedEntry = JSON.stringify(codeEntry);
    const entryLifetime = 300; // 5 minutes in seconds, matching ENTRY_LIFETIME

    await this.set(code, serializedEntry, entryLifetime);
  }

  public async getCode(code: string): Promise<any | null> {
    const serializedEntry = await this.get(code);

    if (!serializedEntry) {
      return null;
    }

    try {
      return JSON.parse(serializedEntry);
    } catch (error) {
      console.error('Error parsing code entry data:', error);
      return null;
    }
  }
}

export const redisClient = RedisClient.getInstance();
