import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  API_SECRET: z.string().min(32).default('dev-secret-please-change-in-production-32chars'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  GOOGLE_PAGESPEED_API_KEY: z.string().optional(),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  STORAGE_PATH: z.string().default('./storage'),
  CRAWLER_MAX_PAGES: z.coerce.number().default(500),
  CRAWLER_MAX_DEPTH: z.coerce.number().default(5),
  CRAWLER_CONCURRENCY: z.coerce.number().default(10),
  CRAWLER_REQUEST_TIMEOUT: z.coerce.number().default(30000),
  CRAWLER_USER_AGENT: z
    .string()
    .default('SEOAuditor/1.0 (+https://seoauditor.io/bot)'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
