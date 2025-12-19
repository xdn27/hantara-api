// Job type definitions for BullMQ queues

export interface EmailJobData {
  // Job metadata
  jobId: string;
  userId: string;
  domainId: string;
  domainName: string;
  apiKeyId: string;

  // Email data
  messageId: string;
  from: {
    name?: string;
    address: string;
  };
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;

  // Template info (for tracking)
  templateId?: string;
  templateName?: string;

  // Timestamps
  createdAt: string;
  scheduledAt?: string;
}

export interface EmailJobResult {
  success: boolean;
  messageId: string;
  acceptedRecipients: string[];
  rejectedRecipients: string[];
  smtpResponse?: string;
  error?: string;
}

// Queue names
export const QUEUE_NAMES = {
  EMAIL_SEND: 'email-send',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
