import { Elysia, t } from 'elysia';
import { eq, sql } from 'drizzle-orm';
import { db, emailTrackingLink, emailTrackingOpen, emailEvent } from '../db';
import { TRANSPARENT_GIF } from '../lib/tracking';

// Generate time-based event ID (sortable)
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `evt_${timestamp}${random}`;
}

/**
 * Tracking Routes
 * 
 * Handles email open tracking (1x1 pixel) and click tracking (link redirects)
 * 
 * Endpoints:
 * - GET /t/o/:id - Open tracking (returns 1x1 transparent GIF)
 * - GET /t/c/:id - Click tracking (redirects to original URL)
 */

// Tracking route plugin
export const trackingRoute = new Elysia({ name: 'tracking-route' })
  /**
   * Open Tracking Endpoint
   * 
   * Returns a 1x1 transparent GIF and logs the open event
   */
  .get(
    '/t/o/:id',
    async ({ params, set, request }) => {
      const { id } = params;
      
      try {
        // Find the tracking record
        const trackingRecord = await db.query.emailTrackingOpen.findFirst({
          where: eq(emailTrackingOpen.id, id)
        });
        
        if (trackingRecord) {
          // Get request metadata
          const userAgent = request.headers.get('user-agent') || '';
          const forwarded = request.headers.get('x-forwarded-for');
          const ipAddress = forwarded?.split(',')[0].trim() || 
                           request.headers.get('x-real-ip') || 
                           '';
          
          // Update tracking record
          await db
            .update(emailTrackingOpen)
            .set({
              openedAt: trackingRecord.openedAt || new Date(),
              openCount: sql`${emailTrackingOpen.openCount} + 1`
            })
            .where(eq(emailTrackingOpen.id, id));
          
          // Check if this is the first open (log event)
          if (!trackingRecord.openedAt) {
            // Insert email event
            await db.insert(emailEvent).values({
              id: generateEventId(),
              userId: trackingRecord.userId,
              messageId: trackingRecord.messageId,
              eventType: 'opened',
              recipientEmail: trackingRecord.recipientEmail,
              sendingDomain: trackingRecord.sendingDomain,
              ipAddress: ipAddress.substring(0, 45),
              userAgent: userAgent.substring(0, 500),
              metadata: JSON.stringify({
                trackingId: id,
                openCount: (trackingRecord.openCount || 0) + 1
              })
            });
          }
        }
      } catch (err) {
        // Log error but still return the pixel
        console.error('Open tracking error:', err);
      }
      
      // Always return the transparent GIF
      set.headers['content-type'] = 'image/gif';
      set.headers['cache-control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
      set.headers['pragma'] = 'no-cache';
      set.headers['expires'] = '0';
      
      return TRANSPARENT_GIF;
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        summary: 'Open Tracking Pixel',
        description: 'Returns a 1x1 transparent GIF and tracks email opens.',
        tags: ['Tracking']
      }
    }
  )
  /**
   * Click Tracking Endpoint
   * 
   * Redirects to the original URL and logs the click event
   */
  .get(
    '/t/c/:id',
    async ({ params, set, request }) => {
      const { id } = params;
      
      try {
        // Find the tracking record
        const trackingRecord = await db.query.emailTrackingLink.findFirst({
          where: eq(emailTrackingLink.id, id)
        });
        
        if (!trackingRecord) {
          set.status = 404;
          return { error: 'Link not found' };
        }
        
        // Get request metadata
        const userAgent = request.headers.get('user-agent') || '';
        const forwarded = request.headers.get('x-forwarded-for');
        const ipAddress = forwarded?.split(',')[0].trim() || 
                         request.headers.get('x-real-ip') || 
                         '';
        
        // Update tracking record
        await db
          .update(emailTrackingLink)
          .set({
            clickedAt: trackingRecord.clickedAt || new Date(),
            clickCount: sql`${emailTrackingLink.clickCount} + 1`
          })
          .where(eq(emailTrackingLink.id, id));
        
        // Check if this is the first click (log event)
        if (!trackingRecord.clickedAt) {
          // Insert email event
          await db.insert(emailEvent).values({
            id: generateEventId(),
            userId: trackingRecord.userId,
            messageId: trackingRecord.messageId,
            eventType: 'clicked',
            recipientEmail: trackingRecord.recipientEmail,
            sendingDomain: trackingRecord.sendingDomain,
            ipAddress: ipAddress.substring(0, 45),
            userAgent: userAgent.substring(0, 500),
            metadata: JSON.stringify({
              trackingId: id,
              url: trackingRecord.originalUrl,
              clickCount: (trackingRecord.clickCount || 0) + 1
            })
          });
        }
        
        // Redirect to original URL
        set.status = 302;
        set.headers['location'] = trackingRecord.originalUrl;
        set.headers['cache-control'] = 'no-store, no-cache, must-revalidate';
        
        return;
      } catch (err) {
        console.error('Click tracking error:', err);
        set.status = 500;
        return { error: 'Tracking error' };
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        summary: 'Click Tracking Redirect',
        description: 'Tracks link clicks and redirects to the original URL.',
        tags: ['Tracking']
      }
    }
  );
