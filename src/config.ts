// Environment configuration for ElysiaJS API Service

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || Bun.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
};

export const config = {
  port: parseInt(getEnv('API_PORT', '3001')),

  database: {
    url: getEnv('DATABASE_URL'),
  },

  redis: {
    url: getEnv('REDIS_URL', 'redis://localhost:6379'),
  },

  haraka: {
    host: getEnv('HARAKA_HOST', 'localhost'),
    port: parseInt(getEnv('HARAKA_PORT', '587')),
  },

  // For HMAC signature on webhooks
  webhookSecret: getEnv('WEBHOOK_SECRET', 'default-webhook-secret'),
};

export type Config = typeof config;
