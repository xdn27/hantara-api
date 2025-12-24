import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authMiddleware } from './middleware/auth';
import { sendRoute } from './routes/send';
import { eventsRoute } from './routes/events';
import { suppressionRoute } from './routes/suppression';
import { adminQueueRoute } from './routes/admin/queues';
import { trackingRoute } from './routes/tracking';

const app = new Elysia()
  .use(cors())
  // Health check (public)
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  // Admin routes (Bull Board UI)
  .use(adminQueueRoute)
  // Public tracking routes (no auth required)
  .use(trackingRoute)
  .group('/api/v1', (app) =>
    app
      .use(authMiddleware)
      .get('/me', ({ auth }) => ({
        apiKey: { id: auth.apiKey.id, name: auth.apiKey.name },
        domain: { id: auth.domain.id, name: auth.domain.name },
        user: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
        billing: auth.billing
          ? { emailLimit: auth.billing.emailLimit, emailUsed: auth.billing.emailUsed }
          : null,
      }))
      .use(sendRoute)
      .use(eventsRoute)
      .use(suppressionRoute)
  )
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
