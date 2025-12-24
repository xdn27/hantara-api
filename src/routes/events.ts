import { Elysia, t } from 'elysia';
import { and, eq, gte, lte, desc, like, sql } from 'drizzle-orm';
import { db, emailEvent } from '../db';
import { authMiddleware, type AuthContext } from '../middleware/auth';

// Valid event types
const EVENT_TYPES = ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed'] as const;

// Events route plugin
export const eventsRoute = new Elysia({ name: 'events-route' })
  .use(authMiddleware)
  // List events with filtering and pagination
  .get(
    '/events',
    async ({ auth, query, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const {
        page = '1',
        limit = '20',
        eventType,
        recipientEmail,
        messageId,
        startDate,
        endDate,
      } = query;

      // Parse pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;

      // Build where conditions
      const conditions = [eq(emailEvent.userId, auth.user.id)];

      if (eventType && EVENT_TYPES.includes(eventType as any)) {
        conditions.push(eq(emailEvent.eventType, eventType));
      }

      if (recipientEmail) {
        conditions.push(like(emailEvent.recipientEmail, `%${recipientEmail}%`));
      }

      if (messageId) {
        conditions.push(eq(emailEvent.messageId, messageId));
      }

      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          conditions.push(gte(emailEvent.createdAt, start));
        }
      }

      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          conditions.push(lte(emailEvent.createdAt, end));
        }
      }

      // Query events
      const events = await db.query.emailEvent.findMany({
        where: and(...conditions),
        orderBy: [desc(emailEvent.createdAt)],
        limit: limitNum,
        offset,
        with: {
          template: {
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
        .from(emailEvent)
        .where(and(...conditions));

      const total = Number(countResult[0]?.count ?? 0);
      const totalPages = Math.ceil(total / limitNum);

      return {
        data: events.map((event) => ({
          id: event.id,
          messageId: event.messageId,
          eventType: event.eventType,
          recipientEmail: event.recipientEmail,
          subject: event.subject,
          template: event.template ? { id: event.template.id, name: event.template.name } : null,
          metadata: event.metadata ? JSON.parse(event.metadata) : null,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          createdAt: event.createdAt.toISOString(),
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
        eventType: t.Optional(t.String()),
        recipientEmail: t.Optional(t.String()),
        messageId: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        summary: 'List Email Events',
        description: 'Query email events with filtering, pagination, and date range support.',
        tags: ['Events'],
      },
    }
  )
  // Get events for a specific message
  .get(
    '/events/:messageId',
    async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { messageId } = params;

      // Query events for this message
      const events = await db.query.emailEvent.findMany({
        where: and(
          eq(emailEvent.userId, auth.user.id),
          eq(emailEvent.messageId, messageId)
        ),
        orderBy: [desc(emailEvent.createdAt)],
        with: {
          template: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (events.length === 0) {
        set.status = 404;
        return { error: 'Not Found', message: 'No events found for this message ID' };
      }

      // Group events by recipient
      const eventsByRecipient: Record<string, any[]> = {};
      for (const event of events) {
        const recipient = event.recipientEmail;
        if (!eventsByRecipient[recipient]) {
          eventsByRecipient[recipient] = [];
        }
        eventsByRecipient[recipient].push({
          id: event.id,
          eventType: event.eventType,
          metadata: event.metadata ? JSON.parse(event.metadata) : null,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          createdAt: event.createdAt.toISOString(),
        });
      }

      // Get first event for summary info
      const firstEvent = events[0];

      return {
        messageId,
        subject: firstEvent.subject,
        template: firstEvent.template ? { id: firstEvent.template.id, name: firstEvent.template.name } : null,
        recipients: Object.keys(eventsByRecipient).length,
        events: eventsByRecipient,
        totalEvents: events.length,
      };
    },
    {
      params: t.Object({
        messageId: t.String(),
      }),
      detail: {
        summary: 'Get Message Events',
        description: 'Get all events for a specific message ID, grouped by recipient.',
        tags: ['Events'],
      },
    }
  )
  // Get event statistics
  .get(
    '/events/stats',
    async ({ auth, query, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { startDate, endDate } = query;

      // Build date conditions
      const conditions = [eq(emailEvent.userId, auth.user.id)];

      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          conditions.push(gte(emailEvent.createdAt, start));
        }
      }

      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          conditions.push(lte(emailEvent.createdAt, end));
        }
      }

      // Get counts by event type
      const stats = await db
        .select({
          eventType: emailEvent.eventType,
          count: sql<number>`count(*)`,
        })
        .from(emailEvent)
        .where(and(...conditions))
        .groupBy(emailEvent.eventType);

      // Transform to object
      const statsByType: Record<string, number> = {};
      let total = 0;
      for (const stat of stats) {
        statsByType[stat.eventType] = Number(stat.count);
        total += Number(stat.count);
      }

      // Calculate rates
      const sent = statsByType['sent'] ?? 0;
      const delivered = statsByType['delivered'] ?? 0;
      const opened = statsByType['opened'] ?? 0;
      const clicked = statsByType['clicked'] ?? 0;
      const bounced = statsByType['bounced'] ?? 0;

      return {
        total,
        byType: statsByType,
        rates: {
          deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(2) + '%' : '0%',
          openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(2) + '%' : '0%',
          clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) + '%' : '0%',
          bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(2) + '%' : '0%',
        },
      };
    },
    {
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Get Event Statistics',
        description: 'Get aggregated email event statistics with delivery, open, click, and bounce rates.',
        tags: ['Events'],
      },
    }
  )
  // Record a new event (for webhooks, external notifications)
  // Auto-suppresses for complaint, unsubscribed, and bounced events
  .post(
    '/events',
    async ({ auth, body, set }) => {
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { eventType, recipientEmail, messageId, metadata } = body;

      // Validate event type
      if (!EVENT_TYPES.includes(eventType as any)) {
        set.status = 400;
        return { error: 'Bad Request', message: `Invalid eventType. Must be one of: ${EVENT_TYPES.join(', ')}` };
      }

      const normalizedEmail = recipientEmail.toLowerCase().trim();

      try {
        // Generate event ID
        const eventId = `evt_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 8)}`;

        // Insert the event
        await db.insert(emailEvent).values({
          id: eventId,
          userId: auth.user.id,
          messageId: messageId || `manual_${eventId}`,
          eventType,
          recipientEmail: normalizedEmail,
          sendingDomain: auth.domain?.name || null,
          metadata: metadata ? JSON.stringify(metadata) : null,
        });

        let suppressionResult = null;

        // Auto-suppression logic for specific event types
        if (eventType === 'complained') {
          // Complaint: immediate permanent suppression
          suppressionResult = await addToSuppressionInternal(
            auth.user.id,
            normalizedEmail,
            'complaint',
            eventId,
            auth.domain?.id,
            { ...metadata, autoSuppressed: true }
          );
        } else if (eventType === 'unsubscribed') {
          // Unsubscribe: immediate permanent suppression
          suppressionResult = await addToSuppressionInternal(
            auth.user.id,
            normalizedEmail,
            'unsubscribe',
            eventId,
            auth.domain?.id,
            { ...metadata, autoSuppressed: true }
          );
        } else if (eventType === 'bounced') {
          // For bounced events, check if hard or soft
          const bounceType = (metadata as any)?.bounceType || 'hard_bounce';
          if (bounceType === 'soft_bounce') {
            // Import and use handleSoftBounce from suppression
            const { handleSoftBounce } = await import('./suppression');
            suppressionResult = await handleSoftBounce(
              auth.user.id,
              normalizedEmail,
              eventId,
              auth.domain?.id,
              metadata as any
            );
          } else {
            suppressionResult = await addToSuppressionInternal(
              auth.user.id,
              normalizedEmail,
              'hard_bounce',
              eventId,
              auth.domain?.id,
              { ...metadata, autoSuppressed: true }
            );
          }
        }

        set.status = 201;
        return {
          success: true,
          eventId,
          eventType,
          recipientEmail: normalizedEmail,
          suppression: suppressionResult,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: 'Internal Error', message: error.message || 'Failed to record event' };
      }
    },
    {
      body: t.Object({
        eventType: t.String({ minLength: 1 }),
        recipientEmail: t.String({ minLength: 1 }),
        messageId: t.Optional(t.String()),
        metadata: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
      detail: {
        summary: 'Record Email Event',
        description: 'Record a new email event. Auto-suppresses for complaint, unsubscribed, and bounced events.',
        tags: ['Events'],
      },
    }
  );

// Helper function to add to suppression list
async function addToSuppressionInternal(
  userId: string,
  email: string,
  reason: string,
  sourceEventId?: string,
  domainId?: string,
  metadata?: Record<string, unknown>
): Promise<{ id: string; email: string; reason: string; alreadyExists: boolean }> {
  const { emailSuppression } = await import('../db');
  const { nanoid } = await import('nanoid');

  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if already exists
  const existing = await db.query.emailSuppression.findFirst({
    where: and(
      eq(emailSuppression.userId, userId),
      eq(emailSuppression.email, normalizedEmail)
    )
  });
  
  if (existing) {
    return { id: existing.id, email: normalizedEmail, reason: existing.reason, alreadyExists: true };
  }
  
  // Insert new suppression
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
  
  return { id, email: normalizedEmail, reason, alreadyExists: false };
}
