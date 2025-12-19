import { Elysia } from 'elysia';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ElysiaAdapter } from '@bull-board/elysia';
import { emailQueue, getQueueStats } from '../../queues';

// Create Bull Board server adapter
const serverAdapter = new ElysiaAdapter('/admin/queues');

// Create Bull Board with email queue
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

// Admin routes plugin
export const adminQueueRoute = new Elysia({ name: 'admin-queue-route' })
  // Mount Bull Board UI
  .use(serverAdapter.registerPlugin())
  // API endpoint for queue stats
  .get('/admin/queues/stats', async () => {
    const stats = await getQueueStats();
    return {
      timestamp: new Date().toISOString(),
      queues: {
        'email-send': stats,
      },
    };
  });
