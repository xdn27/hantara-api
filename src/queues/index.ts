import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { QUEUE_NAMES, type EmailJobData } from './types';

// Redis connection for BullMQ
export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Email send queue
export const emailQueue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL_SEND, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 24 * 60 * 60, // Keep for 24 hours
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs
      age: 7 * 24 * 60 * 60, // Keep for 7 days
    },
  },
});

// Queue events for monitoring
export const emailQueueEvents = new QueueEvents(QUEUE_NAMES.EMAIL_SEND, {
  connection: redisConnection,
});

/**
 * Add email job to queue
 */
export async function addEmailJob(data: EmailJobData, options?: { delay?: number; priority?: number }) {
  const job = await emailQueue.add(
    'send-email',
    data,
    {
      delay: options?.delay,
      priority: options?.priority,
      jobId: data.jobId, // Use our generated ID for deduplication
    }
  );
  return job;
}

/**
 * Get queue stats
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}

// Re-export types
export * from './types';
