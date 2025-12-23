import { Elysia, t } from 'elysia';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, emailEvent, userBilling, emailTrackingLink, emailTrackingOpen } from '../db';
import { authMiddleware, type AuthContext } from '../middleware/auth';
import { addEmailJob, type EmailJobData } from '../queues';
import { applyEmailTracking, type LinkTrackingData } from '../lib/tracking';
import { config } from '../config';

// Email address regex for validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parse email address like "Name <email@domain.com>" or "email@domain.com"
function parseEmailAddress(email: string): { name?: string; address: string } | null {
  const trimmed = email.trim();
  
  // Check for "Name <email@domain.com>" format
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, '');
    const address = match[2].trim();
    if (EMAIL_REGEX.test(address)) {
      return { name, address };
    }
    return null;
  }
  
  // Plain email address
  if (EMAIL_REGEX.test(trimmed)) {
    return { address: trimmed };
  }
  
  return null;
}

// Extract domain from email address
function extractDomain(email: string): string | null {
  const parsed = parseEmailAddress(email);
  if (!parsed) return null;
  const parts = parsed.address.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

// Parse variables from string (form-data) or object (JSON)
function parseVariables(variables: string | Record<string, string> | undefined): Record<string, string> {
  if (!variables) return {};
  
  // If already an object, return as-is
  if (typeof variables === 'object') return variables;
  
  // If string, try to parse as JSON
  if (typeof variables === 'string') {
    try {
      const parsed = JSON.parse(variables);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // Invalid JSON, return empty
      console.warn('Invalid variables JSON string:', variables);
    }
  }
  
  return {};
}

// Render template with variables
// templateIdOrSlug can be either UUID or user-defined slug
async function renderTemplate(
  templateIdOrSlug: string,
  userId: string,
  variables: Record<string, string> = {}
): Promise<{ subject: string; html: string; text?: string; templateId: string } | null> {
  // First try to find by ID
  let template = await db.query.emailTemplate.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, templateIdOrSlug), eq(t.userId, userId), eq(t.isActive, true)),
    with: {
      variables: true,
    },
  });

  // If not found by ID, try to find by slug
  if (!template) {
    template = await db.query.emailTemplate.findFirst({
      where: (t, { and, eq }) => and(eq(t.slug, templateIdOrSlug), eq(t.userId, userId), eq(t.isActive, true)),
      with: {
        variables: true,
      },
    });
  }

  if (!template) return null;

  let subject = template.subject;
  let html = template.htmlContent;

  // Replace variables in subject and content
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    // HTML escape the value for security
    const escapedValue = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    subject = subject.replace(placeholder, escapedValue);
    html = html.replace(placeholder, escapedValue);
  }

  // Apply default values for any remaining variables
  for (const varDef of template.variables) {
    if (varDef.defaultValue) {
      const placeholder = new RegExp(`\\{\\{\\s*${varDef.name}\\s*\\}\\}`, 'g');
      const escapedDefault = varDef.defaultValue
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      subject = subject.replace(placeholder, escapedDefault);
      html = html.replace(placeholder, escapedDefault);
    }
  }

  return { subject, html, templateId: template.id };
}

// Send route plugin
export const sendRoute = new Elysia({ name: 'send-route' })
  .use(authMiddleware)
  .post(
    '/send',
    async ({ auth, body, set }) => {
      // Type guard for auth (should never fail due to middleware)
      if (!auth) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'Authentication required' };
      }

      const { from, to, subject, html, text, templateId, variables: rawVariables, headers, replyTo, disableTracking } = body;
      
      // Parse variables (handles both JSON string from form-data and object from JSON body)
      const variables = parseVariables(rawVariables);

      console.log('Request body:', { ...body, variables });

      // Parse FROM address
      const fromParsed = parseEmailAddress(from);
      if (!fromParsed) {
        set.status = 400;
        return { error: 'Bad Request', message: 'Invalid FROM email address format' };
      }

      // Validate FROM domain matches API key's domain
      const fromDomain = extractDomain(from);
      if (!fromDomain || fromDomain !== auth.domain.name.toLowerCase()) {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: `FROM domain must match your API key's domain (${auth.domain.name})`,
        };
      }

      // Normalize recipients to array
      const recipients = Array.isArray(to) ? to : [to];
      
      // Validate all recipient addresses
    //   for (const recipient of recipients) {
    //     if (!parseEmailAddress(recipient)) {
    //       set.status = 400;
    //       return { error: 'Bad Request', message: `Invalid recipient email: ${recipient}` };
    //     }
    //   }

      // Check rate limit
      if (auth.billing) {
        const emailLimit = auth.billing.emailLimit ?? 0;
        const emailUsed = auth.billing.emailUsed ?? 0;
        const emailsToSend = recipients.length;

        if (emailUsed + emailsToSend > emailLimit) {
          set.status = 429;
          return {
            error: 'Rate Limit Exceeded',
            message: `Monthly email limit reached. Used: ${emailUsed}/${emailLimit}`,
          };
        }
      }

      // Determine email content
      let emailSubject = subject;
      let emailHtml = html;
      let emailText = text;

      // If templateId is provided, render the template
      if (templateId) {
        const rendered = await renderTemplate(templateId, auth.user.id, variables);
        if (!rendered) {
          set.status = 404;
          return { error: 'Not Found', message: 'Template not found or access denied' };
        }
        emailSubject = rendered.subject;
        emailHtml = rendered.html;
        if (!emailText) emailText = undefined; // Template doesn't provide text version
      }

      // Validate we have content
      if (!emailSubject) {
        set.status = 400;
        return { error: 'Bad Request', message: 'Subject is required' };
      }
      if (!emailHtml && !emailText) {
        set.status = 400;
        return { error: 'Bad Request', message: 'Either html or text content is required' };
      }

      // Generate IDs
      const jobId = nanoid();
      const messageId = `<${nanoid()}@${auth.domain.name}>`;

      // Apply email tracking (link wrapping + open pixel)
      let trackingData: {
        modifiedHtml: string;
        openTrackingId: string;
        links: LinkTrackingData[];
      } | null = null;

      const shouldTrack = !disableTracking && emailHtml && (
        config.tracking.enableOpenTracking || config.tracking.enableClickTracking
      );

      if (shouldTrack && emailHtml) {
        trackingData = applyEmailTracking(config.tracking.baseUrl, emailHtml);
        emailHtml = trackingData.modifiedHtml;
      }

      // Parse all recipient addresses
      const recipientAddresses = recipients.map(r => r);

      // Create email event for each recipient (status: queued)
      const eventIds: string[] = [];
      for (const recipientAddr of recipientAddresses) {
        const eventId = nanoid();
        await db.insert(emailEvent).values({
          id: eventId,
          userId: auth.user.id,
          messageId,
          eventType: 'queued',
          recipientEmail: recipientAddr,
          sendingDomain: auth.domain.name,
          subject: emailSubject,
          metadata: JSON.stringify({
            from: fromParsed,
            replyTo,
            headers,
            templateId,
            jobId,
          }),
        });
        eventIds.push(eventId);

        // Create tracking records for this recipient
        if (trackingData) {
          // Open tracking record
          if (config.tracking.enableOpenTracking) {
            await db.insert(emailTrackingOpen).values({
              id: `${trackingData.openTrackingId}_${nanoid(8)}`,
              userId: auth.user.id,
              messageId,
              recipientEmail: recipientAddr,
              sendingDomain: auth.domain.name,
            });
          }

          // Link tracking records (only need to create once per unique link)
          if (config.tracking.enableClickTracking && recipientAddresses.indexOf(recipientAddr) === 0) {
            for (const link of trackingData.links) {
              await db.insert(emailTrackingLink).values({
                id: link.trackingId,
                userId: auth.user.id,
                messageId,
                recipientEmail: recipientAddr, // First recipient as reference
                sendingDomain: auth.domain.name,
                originalUrl: link.originalUrl,
              });
            }
          }
        }
      }

      // Increment email used counter
      if (auth.billing) {
        await db
          .update(userBilling)
          .set({
            emailUsed: sql`${userBilling.emailUsed} + ${recipients.length}`,
          })
          .where(eq(userBilling.id, auth.billing.id));
      }

      // Create job data
      const jobData: EmailJobData = {
        jobId,
        userId: auth.user.id,
        domainId: auth.domain.id,
        domainName: auth.domain.name,
        apiKeyId: auth.apiKey.id,
        messageId,
        from: fromParsed,
        to: recipientAddresses,
        subject: emailSubject!,
        html: emailHtml,
        text: emailText,
        replyTo,
        headers,
        templateId,
        createdAt: new Date().toISOString(),
      };

      // Add job to BullMQ queue
      await addEmailJob(jobData);

      return {
        success: true,
        jobId,
        messageId,
        recipients: recipients.length,
        status: 'queued',
      };
    },
    {
      body: t.Object({
        from: t.String({ minLength: 1 }),
        to: t.Union([t.String({ minLength: 1 }), t.Array(t.String({ minLength: 1 }))]),
        subject: t.Optional(t.String()),
        html: t.Optional(t.String()),
        text: t.Optional(t.String()),
        templateId: t.Optional(t.String()),
        variables: t.Optional(t.Union([t.String(), t.Record(t.String(), t.String())])),
        headers: t.Optional(t.Record(t.String(), t.String())),
        replyTo: t.Optional(t.String()),
        disableTracking: t.Optional(t.Boolean()),
      }),
      detail: {
        summary: 'Send Email',
        description: 'Send an email via HTTP API. Supports templates and variable substitution.',
        tags: ['Email'],
      },
    }
  );
