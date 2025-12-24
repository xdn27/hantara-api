import { Elysia, t } from 'elysia';
import { and, eq, desc, like, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, emailSuppression, domain } from '../db';
import { authMiddleware, type AuthContext } from '../middleware/auth';

// Valid suppression reasons
const SUPPRESSION_REASONS = ['hard_bounce', 'soft_bounce', 'complaint', 'unsubscribe', 'manual'] as const;
type SuppressionReason = typeof SUPPRESSION_REASONS[number];

// Helper function to check if emails are suppressed
// Checks both global suppression (domainId = null) and domain-specific suppression
// Note: soft_bounce does NOT block - only hard_bounce, complaint, unsubscribe, manual
const BLOCKING_REASONS = ['hard_bounce', 'complaint', 'unsubscribe', 'manual'] as const;

export async function checkSuppression(userId: string, emails: string[], domainId?: string): Promise<string[]> {
  if (emails.length === 0) return [];
  
  const normalizedEmails = emails.map(e => e.toLowerCase());
  
  // Query: match userId + email AND blocking reason AND (domainId is null OR domainId matches)
  // soft_bounce is NOT included - it's tracked but doesn't block sending
  const suppressions = await db
    .select({ email: emailSuppression.email })
    .from(emailSuppression)
    .where(
      and(
        eq(emailSuppression.userId, userId),
        inArray(emailSuppression.email, normalizedEmails),
        inArray(emailSuppression.reason, BLOCKING_REASONS as any),
        domainId 
          ? sql`(${emailSuppression.domainId} IS NULL OR ${emailSuppression.domainId} = ${domainId})`
          : sql`${emailSuppression.domainId} IS NULL`
      )
    );
  
  return suppressions.map(s => s.email);
}

// Helper function to add email to suppression list
export async function addToSuppression(
  userId: string,
  email: string,
  reason: SuppressionReason,
  sourceEventId?: string,
  domainId?: string,
  metadata?: Record<string, unknown>
): Promise<{ id: string; email: string; reason: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if already suppressed
  const existing = await db.query.emailSuppression.findFirst({
    where: and(
      eq(emailSuppression.userId, userId),
      eq(emailSuppression.email, normalizedEmail)
    )
  });
  
  if (existing) {
    return { id: existing.id, email: existing.email, reason: existing.reason };
  }
  
  const id = nanoid();
  await db.insert(emailSuppression).values({
    id,
    userId,
    domainId: domainId || null,
    email: normalizedEmail,
    reason,
    sourceEventId: sourceEventId || null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
  
  return { id, email: normalizedEmail, reason };
}

// Threshold for upgrading soft_bounce to hard_bounce
const SOFT_BOUNCE_THRESHOLD = 3;

// Helper function to handle soft bounce with counter
// Tracks soft bounces and upgrades to hard_bounce after threshold
export async function handleSoftBounce(
  userId: string,
  email: string,
  sourceEventId?: string,
  domainId?: string,
  bounceDetails?: Record<string, unknown>
): Promise<{ id: string; email: string; reason: string; upgraded: boolean }> {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if already has a suppression entry
  const existing = await db.query.emailSuppression.findFirst({
    where: and(
      eq(emailSuppression.userId, userId),
      eq(emailSuppression.email, normalizedEmail)
    )
  });
  
  if (existing) {
    // If already hard_bounce or other blocking reason, return as-is
    if (existing.reason !== 'soft_bounce') {
      return { id: existing.id, email: existing.email, reason: existing.reason, upgraded: false };
    }
    
    // Parse existing metadata to get bounce count
    let metadata: Record<string, unknown> = {};
    try {
      metadata = existing.metadata ? JSON.parse(existing.metadata) : {};
    } catch { /* ignore parse errors */ }
    
    const currentCount = (metadata.softBounceCount as number) || 1;
    const newCount = currentCount + 1;
    
    // Check if should upgrade to hard_bounce
    if (newCount >= SOFT_BOUNCE_THRESHOLD) {
      // Upgrade to hard_bounce
      await db.update(emailSuppression)
        .set({
          reason: 'hard_bounce',
          metadata: JSON.stringify({
            ...metadata,
            ...bounceDetails,
            softBounceCount: newCount,
            upgradedAt: new Date().toISOString(),
            upgradeReason: `Upgraded after ${newCount} consecutive soft bounces`
          })
        })
        .where(eq(emailSuppression.id, existing.id));
      
      return { id: existing.id, email: normalizedEmail, reason: 'hard_bounce', upgraded: true };
    }
    
    // Just update the count
    await db.update(emailSuppression)
      .set({
        metadata: JSON.stringify({
          ...metadata,
          ...bounceDetails,
          softBounceCount: newCount,
          lastBounceAt: new Date().toISOString()
        })
      })
      .where(eq(emailSuppression.id, existing.id));
    
    return { id: existing.id, email: normalizedEmail, reason: 'soft_bounce', upgraded: false };
  }
  
  // New soft bounce entry
  const id = nanoid();
  await db.insert(emailSuppression).values({
    id,
    userId,
    domainId: domainId || null,
    email: normalizedEmail,
    reason: 'soft_bounce',
    sourceEventId: sourceEventId || null,
    metadata: JSON.stringify({
      ...bounceDetails,
      softBounceCount: 1,
      firstBounceAt: new Date().toISOString()
    }),
  });
  
  return { id, email: normalizedEmail, reason: 'soft_bounce', upgraded: false };
}

// Helper function to remove from suppression list
export async function removeFromSuppression(userId: string, id: string): Promise<boolean> {
  const result = await db
    .delete(emailSuppression)
    .where(
      and(
        eq(emailSuppression.userId, userId),
        eq(emailSuppression.id, id)
      )
    );
  
  return true;
}

// Suppression route plugin
export const suppressionRoute = new Elysia({ name: 'suppression-route' })
  .use(authMiddleware)
  // List suppressions with pagination and filters
  .get(
    '/suppressions',
    async ({ auth, query, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const {
        page = '1',
        limit = '20',
        reason,
        email,
        domainId,
      } = query;

      // Parse pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      // Build where conditions
      const conditions = [eq(emailSuppression.userId, auth.user.id)];

      if (reason && SUPPRESSION_REASONS.includes(reason as SuppressionReason)) {
        conditions.push(eq(emailSuppression.reason, reason as SuppressionReason));
      }

      if (email) {
        conditions.push(like(emailSuppression.email, `%${email.toLowerCase()}%`));
      }

      if (domainId) {
        conditions.push(eq(emailSuppression.domainId, domainId));
      }

      // Query suppressions
      const suppressions = await db.query.emailSuppression.findMany({
        where: and(...conditions),
        orderBy: [desc(emailSuppression.createdAt)],
        limit: limitNum,
        offset,
        with: {
          domain: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(emailSuppression)
        .where(and(...conditions));

      const total = Number(countResult[0]?.count ?? 0);
      const totalPages = Math.ceil(total / limitNum);

      return {
        data: suppressions.map((s) => ({
          id: s.id,
          email: s.email,
          reason: s.reason,
          domain: s.domain ? { id: s.domain.id, name: s.domain.name } : null,
          sourceEventId: s.sourceEventId,
          metadata: s.metadata ? JSON.parse(s.metadata) : null,
          createdAt: s.createdAt.toISOString(),
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        reason: t.Optional(t.String()),
        email: t.Optional(t.String()),
        domainId: t.Optional(t.String()),
      }),
      detail: {
        summary: 'List Suppressed Emails',
        description: 'Query suppressed email addresses with filtering and pagination.',
        tags: ['Suppression'],
      },
    }
  )
  // Check if email is suppressed
  .get(
    '/suppressions/check',
    async ({ auth, query, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { email } = query;
      if (!email) {
        set.status = 400;
        return { error: 'Bad Request', message: 'Email parameter is required' };
      }

      const suppressed = await checkSuppression(auth.user.id, [email.toLowerCase()]);
      
      return {
        email: email.toLowerCase(),
        suppressed: suppressed.length > 0,
      };
    },
    {
      query: t.Object({
        email: t.String(),
      }),
      detail: {
        summary: 'Check Email Suppression',
        description: 'Check if a specific email address is on the suppression list.',
        tags: ['Suppression'],
      },
    }
  )
  // Add email to suppression list
  .post(
    '/suppressions',
    async ({ auth, body, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { email, reason, domainId, metadata } = body;

      // Validate reason
      if (!SUPPRESSION_REASONS.includes(reason as SuppressionReason)) {
        set.status = 400;
        return { error: 'Bad Request', message: `Invalid reason. Must be one of: ${SUPPRESSION_REASONS.join(', ')}` };
      }

      // Validate domain if provided
      if (domainId) {
        const domainExists = await db.query.domain.findFirst({
          where: and(
            eq(domain.id, domainId),
            eq(domain.userId, auth.user.id)
          )
        });
        
        if (!domainExists) {
          set.status = 400;
          return { error: 'Bad Request', message: 'Invalid domain ID' };
        }
      }

      try {
        const result = await addToSuppression(
          auth.user.id,
          email,
          reason as SuppressionReason,
          undefined,
          domainId,
          metadata
        );

        set.status = 201;
        return {
          success: true,
          ...result,
        };
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Error', message: 'Failed to add suppression' };
      }
    },
    {
      body: t.Object({
        email: t.String({ minLength: 1 }),
        reason: t.String({ minLength: 1 }),
        domainId: t.Optional(t.String()),
        metadata: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
      detail: {
        summary: 'Add Email to Suppression List',
        description: 'Manually add an email address to the suppression list.',
        tags: ['Suppression'],
      },
    }
  )
  // Remove email from suppression list
  .delete(
    '/suppressions/:id',
    async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { id } = params;

      // Check if suppression exists and belongs to user
      const existing = await db.query.emailSuppression.findFirst({
        where: and(
          eq(emailSuppression.id, id),
          eq(emailSuppression.userId, auth.user.id)
        )
      });

      if (!existing) {
        set.status = 404;
        return { error: 'Not Found', message: 'Suppression not found' };
      }

      await removeFromSuppression(auth.user.id, id);

      return {
        success: true,
        message: `Email ${existing.email} removed from suppression list`,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Remove Email from Suppression List',
        description: 'Remove an email address from the suppression list.',
        tags: ['Suppression'],
      },
    }
  )
  // Get suppression statistics
  .get(
    '/suppressions/stats',
    async ({ auth, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      // Get counts by reason
      const stats = await db
        .select({
          reason: emailSuppression.reason,
          count: sql<number>`count(*)`,
        })
        .from(emailSuppression)
        .where(eq(emailSuppression.userId, auth.user.id))
        .groupBy(emailSuppression.reason);

      // Transform to object
      const statsByReason: Record<string, number> = {};
      let total = 0;
      for (const stat of stats) {
        statsByReason[stat.reason] = Number(stat.count);
        total += Number(stat.count);
      }

      return {
        total,
        byReason: statsByReason,
      };
    },
    {
      detail: {
        summary: 'Get Suppression Statistics',
        description: 'Get aggregated suppression statistics grouped by reason.',
        tags: ['Suppression'],
      },
    }
  );
