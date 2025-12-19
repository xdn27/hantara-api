import { Worker, Job } from 'bullmq';
import { createTransport, type Transporter } from 'nodemailer';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { redisConnection, QUEUE_NAMES, type EmailJobData, type EmailJobResult } from '../queues';
import { db, emailEvent, userBilling } from '../db';
import { config } from '../config';

// Create SMTP transporter for Haraka
const createSmtpTransporter = (): Transporter => {
  return createTransport({
    host: config.haraka.host,
    port: config.haraka.port,
    secure: false, // Use STARTTLS
    tls: {
      rejectUnauthorized: false, // For local development
    },
    // Note: Haraka auth plugin will validate credentials
    // For API emails, we use a service account or skip auth
  });
};

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!transporter) {
    transporter = createSmtpTransporter();
  }
  return transporter;
};

/**
 * Process email job
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<EmailJobResult> {
  const data = job.data;
  console.log(`[Email Worker] Processing job ${job.id} - Message: ${data.messageId}`);

  const smtp = getTransporter();

  try {
    // Build email options
    const mailOptions = {
      from: data.from.name ? `"${data.from.name}" <${data.from.address}>` : data.from.address,
      to: data.to.join(', '),
      subject: data.subject,
      html: data.html,
      text: data.text,
      replyTo: data.replyTo,
      headers: {
        'X-Message-Id': data.messageId,
        'X-User-Id': data.userId,
        'X-Domain-Id': data.domainId,
        'X-API-Key-Id': data.apiKeyId,
        ...(data.headers || {}),
      },
      messageId: data.messageId,
    };

    // Send email via Haraka
    const info = await smtp.sendMail(mailOptions);

    console.log(`[Email Worker] Email sent: ${data.messageId} - Response: ${info.response}`);

    // Update email events from 'queued' to 'sent'
    await db
      .update(emailEvent)
      .set({
        eventType: 'sent',
        metadata: JSON.stringify({
          smtpResponse: info.response,
          smtpMessageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
        }),
      })
      .where(eq(emailEvent.messageId, data.messageId));

    return {
      success: true,
      messageId: data.messageId,
      acceptedRecipients: info.accepted as string[],
      rejectedRecipients: info.rejected as string[],
      smtpResponse: info.response,
    };
  } catch (error: any) {
    console.error(`[Email Worker] Failed to send ${data.messageId}:`, error.message);

    // Update email events to 'failed'
    await db
      .update(emailEvent)
      .set({
        eventType: 'failed',
        metadata: JSON.stringify({
          error: error.message,
          code: error.code,
          attempt: job.attemptsMade + 1,
        }),
      })
      .where(eq(emailEvent.messageId, data.messageId));

    // If this is the last attempt, rollback the email count
    if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
      console.log(`[Email Worker] Last attempt failed for ${data.messageId}, rolling back email count`);
      
      // Get user's billing record and decrement email used
      const billing = await db.query.userBilling.findFirst({
        where: eq(userBilling.userId, data.userId),
      });

      if (billing) {
        await db
          .update(userBilling)
          .set({
            emailUsed: sql`GREATEST(0, ${userBilling.emailUsed} - ${data.to.length})`,
          })
          .where(eq(userBilling.id, billing.id));
      }
    }

    // Re-throw to trigger retry
    throw error;
  }
}

/**
 * Create and start the email worker
 */
export function createEmailWorker() {
  const worker = new Worker<EmailJobData, EmailJobResult>(
    QUEUE_NAMES.EMAIL_SEND,
    processEmailJob,
    {
      connection: redisConnection,
      concurrency: 5, // Process 5 jobs concurrently
      limiter: {
        max: 100, // Max 100 jobs
        duration: 1000, // Per second
      },
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`[Email Worker] Job ${job.id} completed - ${result.acceptedRecipients.length} sent`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Email Worker] Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[Email Worker] Worker error:', error);
  });

  console.log('[Email Worker] Started');
  return worker;
}

export { processEmailJob };
