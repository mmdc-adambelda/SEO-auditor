import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

// Railway (and most cloud providers) supply REDIS_URL; fall back to host/port for local dev
export const redis = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  : new IORedis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { err }));

export default redis;
