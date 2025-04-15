import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.redisClient = new Redis({
      host: this.configService.getOrThrow<string>('REDIS_HOST', 'localhost'),
      port: this.configService.getOrThrow<number>('REDIS_PORT', 6379),
      // Add additional options as needed:
      password: this.configService.getOrThrow<string>('REDIS_PASSWORD'),
      // db: this.configService.get<number>('REDIS_DB', 0),
    });

    this.redisClient.on('connect', async () => {
      console.log('✅ Redis Connected Successfully');

      const appEnv = this.configService.get<string>('APP_ENV', 'development');

      if (appEnv === 'production') {
        await this.redisClient.flushall();
        console.log(
          '✅ Redis cache cleared on initialization (production environment)',
        );
      } else {
        console.log(`ℹ️ Redis cache not cleared (${appEnv} environment)`);
      }
    });

    this.redisClient.on('error', (err) => {
      console.error('❌ Redis Connection Error:', err);
    });
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
    console.log('Redis connection closed');
  }

  // Basic operations
  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const stringValue =
      typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (ttlInSeconds) {
      await this.redisClient.set(key, stringValue, 'EX', ttlInSeconds);
    } else {
      await this.redisClient.set(key, stringValue);
    }
  }

  async get(key: string): Promise<any> {
    const value = await this.redisClient.get(key);
    if (!value) return null;

    try {
      // Try to parse as JSON first
      return JSON.parse(value);
    } catch (e) {
      // If not valid JSON, return as is
      return value;
    }
  }

  async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  async flushAll(): Promise<void> {
    await this.redisClient.flushall();
  }

  // Hash operations
  async hset(key: string, field: string, value: any): Promise<void> {
    const stringValue =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    await this.redisClient.hset(key, field, stringValue);
  }

  async hget(key: string, field: string): Promise<any> {
    const value = await this.redisClient.hget(key, field);
    if (!value) return null;

    try {
      // Try to parse as JSON first
      return JSON.parse(value);
    } catch (e) {
      // If not valid JSON, return as is
      return value;
    }
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redisClient.hdel(key, field);
  }

  async hgetall(key: string): Promise<Record<string, any>> {
    const result = await this.redisClient.hgetall(key);

    // Convert string values to objects if they are valid JSON
    const parsedResult: Record<string, any> = {};
    for (const [field, value] of Object.entries(result)) {
      try {
        parsedResult[field] = JSON.parse(value);
      } catch (e) {
        parsedResult[field] = value;
      }
    }

    return parsedResult;
  }

  // List operations
  async lpush(key: string, ...values: any[]): Promise<void> {
    const stringValues = values.map((v) =>
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    );
    await this.redisClient.lpush(key, ...stringValues);
  }

  async rpush(key: string, ...values: any[]): Promise<void> {
    const stringValues = values.map((v) =>
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    );
    await this.redisClient.rpush(key, ...stringValues);
  }

  async lrange(key: string, start: number, end: number): Promise<any[]> {
    const values = await this.redisClient.lrange(key, start, end);

    return values.map((value) => {
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    });
  }

  // Get the Redis client for advanced operations
  getClient(): Redis {
    return this.redisClient;
  }
}
