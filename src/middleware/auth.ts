import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, domainApiKey } from '../db';
import { hashApiKey } from '../lib/apikey';

// Types for authenticated context
export interface AuthContext {
  apiKey: {
    id: string;
    name: string;
    domainId: string;
    userId: string;
  };
  domain: {
    id: string;
    name: string;
    userId: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  billing: {
    id: string;
    emailLimit: number | null;
    emailUsed: number | null;
  } | null;
}

/**
 * API Key Authentication Middleware
 * 
 * Extracts Bearer token from Authorization header,
 * validates against domainApiKey table, and attaches
 * user/domain context to the request.
 */
export const authMiddleware = new Elysia({ name: 'auth' })
  .state('auth', null as AuthContext | null)
  .onBeforeHandle(async ({ headers, set, store }) => {
    const authHeader = headers.authorization;

    // Check for Authorization header
    if (!authHeader) {
      set.status = 401;
      return {
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      };
    }

    // Check for Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      set.status = 401;
      return {
        error: 'Unauthorized',
        message: 'Invalid Authorization format. Use: Bearer <api_key>',
      };
    }

    // Extract and hash the API key
    const key = authHeader.slice(7).trim();
    if (!key) {
      set.status = 401;
      return {
        error: 'Unauthorized',
        message: 'API key is empty',
      };
    }

    const keyHash = hashApiKey(key);

    try {
      // Find API key with related domain and user
      const apiKeyRecord = await db.query.domainApiKey.findFirst({
        where: eq(domainApiKey.keyHash, keyHash),
        with: {
          domain: true,
          user: {
            with: {
              userBillings: {
                limit: 1,
              },
            },
          },
        },
      });

      // Check if API key exists
      if (!apiKeyRecord) {
        set.status = 401;
        return {
          error: 'Unauthorized',
          message: 'Invalid API key',
        };
      }

      // Check if API key is active
      if (!apiKeyRecord.isActive) {
        set.status = 401;
        return {
          error: 'Unauthorized',
          message: 'API key is disabled',
        };
      }

      // Check if domain is verified (TXT record)
      if (!apiKeyRecord.domain.txtVerified) {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Domain is not verified. Please verify your domain first.',
        };
      }

      // Update lastUsedAt timestamp (fire and forget)
      db.update(domainApiKey)
        .set({ lastUsedAt: new Date() })
        .where(eq(domainApiKey.id, apiKeyRecord.id))
        .execute()
        .catch(() => {}); // Ignore errors

      // Get billing info (first one)
      const billingRecord = apiKeyRecord.user.userBillings[0] || null;

      // Store auth context in state
      store.auth = {
        apiKey: {
          id: apiKeyRecord.id,
          name: apiKeyRecord.name,
          domainId: apiKeyRecord.domainId,
          userId: apiKeyRecord.userId,
        },
        domain: {
          id: apiKeyRecord.domain.id,
          name: apiKeyRecord.domain.name,
          userId: apiKeyRecord.domain.userId,
        },
        user: {
          id: apiKeyRecord.user.id,
          name: apiKeyRecord.user.name,
          email: apiKeyRecord.user.email,
        },
        billing: billingRecord
          ? {
              id: billingRecord.id,
              emailLimit: billingRecord.emailLimit,
              emailUsed: billingRecord.emailUsed,
            }
          : null,
      };

      // Continue to next handler (don't return anything)
    } catch (err) {
      console.error('Auth middleware error:', err);
      set.status = 500;
      return {
        error: 'Internal Server Error',
        message: 'Failed to authenticate',
      };
    }
  })
  .derive(({ store }) => ({
    // Expose auth context directly on the request
    auth: store.auth as AuthContext,
  }));
