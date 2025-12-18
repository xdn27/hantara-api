import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authMiddleware } from './middleware/auth';

const app = new Elysia()
  .use(cors())
  // Health check (public)
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  // Protected test endpoint
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
  )
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
