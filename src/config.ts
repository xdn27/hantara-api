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
    port: parseInt(getEnv('HARAKA_PORT', '2525')),
  },

  tracking: {
    // Base URL for tracking endpoints (e.g., https://track.yourdomain.com or http://localhost:3001)
    baseUrl: getEnv('TRACKING_BASE_URL', 'http://localhost:3001'),
    // Enable/disable tracking features
    enableOpenTracking: getEnv('ENABLE_OPEN_TRACKING', 'true') === 'true',
    enableClickTracking: getEnv('ENABLE_CLICK_TRACKING', 'true') === 'true',
  },

  // For HMAC signature on webhooks
  webhookSecret: getEnv('WEBHOOK_SECRET', 'default-webhook-secret'),
};

export type Config = typeof config;
