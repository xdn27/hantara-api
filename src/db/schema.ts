import { pgTable, varchar, timestamp, text, boolean, integer, decimal, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// Enums
// ============================================
export const paymentStatusEnum = pgEnum('payment_status_enum', ['pending', 'success', 'failed', 'refunded']);

// ============================================
// Tables
// ============================================

export const user = pgTable('user', {
	id: varchar('id', { length: 255 }).primaryKey(),
	username: varchar('username', { length: 5 }).notNull().unique(),
	name: varchar('name', { length: 100 }).notNull(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	companyName: varchar('company_name', { length: 255 }).notNull(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	role: varchar('role', { length: 20 }).notNull().default('member'), // 'admin' | 'member'
	status: integer('status').notNull().default(0)
});

export const session = pgTable('session', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	expiresAt: timestamp('expires_at', { mode: 'date' }).notNull()
});

export const emailTemplateCategory = pgTable('email_template_category', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 500 }),
	color: varchar('color', { length: 7 }).default('#6366f1'),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const emailTemplate = pgTable('email_template', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	categoryId: varchar('category_id', { length: 255 }).references(() => emailTemplateCategory.id),
	slug: varchar('slug', { length: 100 }), // User-defined identifier, unique per user
	name: varchar('name', { length: 100 }).notNull(),
	subject: varchar('subject', { length: 500 }).notNull(),
	htmlContent: text('html_content').notNull(),
	jsonContent: text('json_content'),
	previewText: varchar('preview_text', { length: 200 }),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
}, (table) => ({
	userSlugIdx: uniqueIndex('email_template_user_slug_idx').on(table.userId, table.slug)
}));

export const emailTemplateVariable = pgTable('email_template_variable', {
	id: varchar('id', { length: 255 }).primaryKey(),
	templateId: varchar('template_id', { length: 255 }).notNull().references(() => emailTemplate.id),
	name: varchar('name', { length: 100 }).notNull(),
	label: varchar('label', { length: 100 }).notNull(),
	defaultValue: varchar('default_value', { length: 500 }),
	description: varchar('description', { length: 255 }),
	isRequired: boolean('is_required').default(false),
	sortOrder: integer('sort_order').default(0)
});

export const domain = pgTable('domain', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	name: varchar('name', { length: 255 }).notNull(),
	// TXT verification for domain ownership
	txtVerified: boolean('txt_verified').default(false),
	txtToken: varchar('txt_token', { length: 64 }),
	txtVerifiedAt: timestamp('txt_verified_at', { mode: 'date' }),
	// CNAME for custom link tracking
	cnameVerified: boolean('cname_verified').default(false),
	cnameHost: varchar('cname_host', { length: 255 }),
	cnameVerifiedAt: timestamp('cname_verified_at', { mode: 'date' }),
	// SPF verification
	spfVerified: boolean('spf_verified').default(false),
	spfVerifiedAt: timestamp('spf_verified_at', { mode: 'date' }),
	// DKIM verification
	dkimVerified: boolean('dkim_verified').default(false),
	dkimSelector: varchar('dkim_selector', { length: 100 }).default('imail'),
	dkimPrivateKey: text('dkim_private_key'),
	dkimPublicKey: text('dkim_public_key'),
	dkimVerifiedAt: timestamp('dkim_verified_at', { mode: 'date' }),
	// DMARC verification
	dmarcVerified: boolean('dmarc_verified').default(false),
	dmarcVerifiedAt: timestamp('dmarc_verified_at', { mode: 'date' }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const smtpCredential = pgTable('smtp_credential', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	domainId: varchar('domain_id', { length: 255 }).notNull().references(() => domain.id),
	description: varchar('description', { length: 255 }).notNull(),
	username: varchar('username', { length: 64 }).notNull().unique(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	isActive: boolean('is_active').notNull().default(true),
	lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
}, (table) => ({
	usernameIdx: index('smtp_credential_username_idx').on(table.username),
	domainIdx: index('smtp_credential_domain_idx').on(table.domainId)
}));

export const domainApiKey = pgTable('domain_api_key', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	domainId: varchar('domain_id', { length: 255 }).notNull().references(() => domain.id),
	name: varchar('name', { length: 100 }).notNull(),
	keyHash: varchar('key_hash', { length: 255 }).notNull(),
	keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
	isActive: boolean('is_active').notNull().default(true),
	lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
}, (table) => ({
	domainIdx: index('domain_api_key_domain_idx').on(table.domainId),
	keyHashIdx: index('domain_api_key_hash_idx').on(table.keyHash)
}));

export const domainWebhook = pgTable('domain_webhook', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	domainId: varchar('domain_id', { length: 255 }).notNull().references(() => domain.id),
	name: varchar('name', { length: 100 }).notNull(),
	url: varchar('url', { length: 500 }).notNull(),
	secret: varchar('secret', { length: 64 }).notNull(),
	events: text('events').notNull(), // JSON array: ["email.delivered", "email.bounced"]
	isActive: boolean('is_active').notNull().default(true),
	lastTriggeredAt: timestamp('last_triggered_at', { mode: 'date' }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
}, (table) => ({
	domainIdx: index('domain_webhook_domain_idx').on(table.domainId)
}));

export const activityLog = pgTable('activity_log', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	type: varchar('type', { length: 50 }).notNull(), // e.g., 'template.created', 'domain.added'
	action: varchar('action', { length: 50 }).notNull(), // e.g., 'created', 'updated', 'deleted'
	resourceType: varchar('resource_type', { length: 50 }).notNull(), // e.g., 'template', 'domain'
	resourceId: varchar('resource_id', { length: 255 }),
	resourceName: varchar('resource_name', { length: 255 }),
	metadata: text('metadata'), // JSON for additional context
	ipAddress: varchar('ip_address', { length: 45 }),
	userAgent: varchar('user_agent', { length: 500 }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date())
});

export const emailEvent = pgTable('email_event', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	messageId: varchar('message_id', { length: 255 }).notNull(), // Email message identifier
	eventType: varchar('event_type', { length: 50 }).notNull(), // sent, delivered, opened, clicked, bounced, complained, unsubscribed
	recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
	sendingDomain: varchar('sending_domain', { length: 255 }), // Domain used to send the email
	subject: varchar('subject', { length: 500 }),
	templateId: varchar('template_id', { length: 255 }).references(() => emailTemplate.id),
	templateName: varchar('template_name', { length: 100 }),
	metadata: text('metadata'), // JSON for additional event data (click URL, bounce reason, etc.)
	ipAddress: varchar('ip_address', { length: 45 }),
	userAgent: varchar('user_agent', { length: 500 }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
	userIdx: index('email_event_user_idx').on(table.userId),
	messageIdx: index('email_event_message_idx').on(table.messageId),
	domainIdx: index('email_event_domain_idx').on(table.sendingDomain),
	eventTypeIdx: index('email_event_type_idx').on(table.eventType)
}));

export const webhookLog = pgTable('webhook_log', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	domainName: varchar('domain_name', { length: 255 }).notNull(),
	webhookName: varchar('webhook_name', { length: 100 }).notNull(),
	requestUrl: varchar('request_url', { length: 500 }).notNull(),
	eventType: varchar('event_type', { length: 50 }).notNull(), // e.g., 'email.sent', 'email.delivered'
	status: varchar('status', { length: 20 }).notNull(), // 'success', 'failed', 'pending'
	statusCode: integer('status_code'), // HTTP response status code
	responseTime: integer('response_time'), // Response time in milliseconds
	requestPayload: text('request_payload'), // JSON payload sent
	responseBody: text('response_body'), // Response from webhook endpoint
	errorMessage: varchar('error_message', { length: 500 }),
	attempt: integer('attempt').default(1), // Retry attempt number
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date())
});

export const emailQueue = pgTable('email_queue', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	domainId: varchar('domain_id', { length: 255 }).notNull().references(() => domain.id),
	fromEmail: varchar('from_email', { length: 255 }).notNull(),
	toEmails: text('to_emails').notNull(), // JSON array
	subject: varchar('subject', { length: 500 }).notNull(),
	htmlContent: text('html_content'),
	textContent: text('text_content'),
	templateId: varchar('template_id', { length: 255 }).references(() => emailTemplate.id),
	variables: text('variables'), // JSON
	headers: text('headers'), // JSON
	status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, queued, sent, failed
	messageId: varchar('message_id', { length: 255 }),
	errorMessage: text('error_message'),
	scheduledAt: timestamp('scheduled_at', { mode: 'date' }),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	sentAt: timestamp('sent_at', { mode: 'date' })
}, (table) => ({
	userIdx: index('email_queue_user_idx').on(table.userId),
	domainIdx: index('email_queue_domain_idx').on(table.domainId),
	statusIdx: index('email_queue_status_idx').on(table.status)
}));

export const passwordResetToken = pgTable('password_reset_token', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	tokenHash: varchar('token_hash', { length: 255 }).notNull(),
	expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date())
});

export const package_ = pgTable('package', {
	id: varchar('id', { length: 255 }).primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 500 }),
	price: decimal('price', { precision: 10, scale: 2 }).notNull().default('0.00'),
	billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('monthly'), // 'monthly' | 'yearly'
	emailLimit: integer('email_limit').notNull().default(1000), // Monthly email limit
	domainLimit: integer('domain_limit').notNull().default(1),
	templateLimit: integer('template_limit').notNull().default(10),
	apiKeyLimit: integer('api_key_limit').notNull().default(2),
	webhookLimit: integer('webhook_limit').notNull().default(2),
	features: text('features'), // JSON array of feature flags
	isActive: boolean('is_active').notNull().default(true),
	sortOrder: integer('sort_order').default(0),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const paymentMethod = pgTable('payment_method', {
	id: varchar('id', { length: 255 }).primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	type: varchar('type', { length: 50 }).notNull(), // 'bank_transfer' | 'credit_card' | 'ewallet' | 'crypto'
	provider: varchar('provider', { length: 50 }), // 'midtrans', 'xendit', 'stripe', etc.
	description: varchar('description', { length: 500 }),
	config: text('config'), // JSON config for payment gateway
	logoUrl: varchar('logo_url', { length: 500 }),
	isActive: boolean('is_active').notNull().default(true),
	sortOrder: integer('sort_order').default(0),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const userBilling = pgTable('user_billing', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	packageId: varchar('package_id', { length: 255 }).references(() => package_.id),
	packagePrice: decimal('package_price', { precision: 10, scale: 2 }),
	domainLimit: integer('domain_limit'),
	emailLimit: integer('email_limit'),
	templateLimit: integer('template_limit'),
	apiKeyLimit: integer('api_key_limit'),
	webhookLimit: integer('webhook_limit'),
	features: text('features'),
	status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'pending' | 'suspended' | 'cancelled'
	billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('monthly'),
	currentPeriodStart: timestamp('current_period_start', { mode: 'date' }),
	currentPeriodEnd: timestamp('current_period_end', { mode: 'date' }),
	emailUsed: integer('email_used').default(0),
	lastPaymentDate: timestamp('last_payment_date', { mode: 'date' }),
	lastPaymentAmount: decimal('last_payment_amount', { precision: 10, scale: 2 }),
	paymentMethodId: varchar('payment_method_id', { length: 255 }).references(() => paymentMethod.id),
	notes: text('notes'),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const invoice = pgTable('invoice', {
	id: varchar('id', { length: 255 }).primaryKey(),
	invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	userBillingId: varchar('user_billing_id', { length: 255 }).references(() => userBilling.id),
	paymentMethodId: varchar('payment_method_id', { length: 255 }).references(() => paymentMethod.id),
	packageId: varchar('package_id', { length: 255 }).references(() => package_.id),
	amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
	tax: decimal('tax', { precision: 12, scale: 2 }).default('0.00'),
	totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
	status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'paid' | 'cancelled' | 'overdue'
	dueDate: timestamp('due_date', { mode: 'date' }),
	paidAt: timestamp('paid_at', { mode: 'date' }),
	notes: text('notes'),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const payment = pgTable('payment', {
	id: varchar('id', { length: 255 }).primaryKey(),
	invoiceId: varchar('invoice_id', { length: 255 }).notNull().references(() => invoice.id),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	paymentMethodId: varchar('payment_method_id', { length: 255 }).references(() => paymentMethod.id),
	amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
	status: paymentStatusEnum('status').notNull().default('pending'),
	transactionRef: varchar('transaction_ref', { length: 100 }).unique(),
	senderName: varchar('sender_name', { length: 255 }),
	senderBank: varchar('sender_bank', { length: 255 }),
	proofOfPayment: varchar('proof_of_payment', { length: 500 }), // URL or Ref ID
	gatewayResponse: text('gateway_response'), // JSON response from payment gateway
	notes: text('notes'),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

// ============================================
// Relations
// ============================================

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	emailTemplateCategories: many(emailTemplateCategory),
	emailTemplates: many(emailTemplate),
	domains: many(domain),
	activityLogs: many(activityLog),
	invoices: many(invoice),
	payments: many(payment),
	emailEvents: many(emailEvent),
	webhookLogs: many(webhookLog),
	passwordResetTokens: many(passwordResetToken),
	userBillings: many(userBilling),
	notifications: many(notification),
	emailQueues: many(emailQueue),
	emailSuppressions: many(emailSuppression)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const emailTemplateCategoryRelations = relations(emailTemplateCategory, ({ one, many }) => ({
	user: one(user, {
		fields: [emailTemplateCategory.userId],
		references: [user.id]
	}),
	templates: many(emailTemplate)
}));

export const emailTemplateRelations = relations(emailTemplate, ({ one, many }) => ({
	user: one(user, {
		fields: [emailTemplate.userId],
		references: [user.id]
	}),
	category: one(emailTemplateCategory, {
		fields: [emailTemplate.categoryId],
		references: [emailTemplateCategory.id]
	}),
	variables: many(emailTemplateVariable),
	emailEvents: many(emailEvent)
}));

export const emailTemplateVariableRelations = relations(emailTemplateVariable, ({ one }) => ({
	template: one(emailTemplate, {
		fields: [emailTemplateVariable.templateId],
		references: [emailTemplate.id]
	})
}));

export const domainRelations = relations(domain, ({ one, many }) => ({
	user: one(user, {
		fields: [domain.userId],
		references: [user.id]
	}),
	smtpCredentials: many(smtpCredential),
	apiKeys: many(domainApiKey),
	webhooks: many(domainWebhook),
	emailQueues: many(emailQueue)
}));

export const smtpCredentialRelations = relations(smtpCredential, ({ one }) => ({
	user: one(user, {
		fields: [smtpCredential.userId],
		references: [user.id]
	}),
	domain: one(domain, {
		fields: [smtpCredential.domainId],
		references: [domain.id]
	})
}));

export const domainApiKeyRelations = relations(domainApiKey, ({ one }) => ({
	user: one(user, {
		fields: [domainApiKey.userId],
		references: [user.id]
	}),
	domain: one(domain, {
		fields: [domainApiKey.domainId],
		references: [domain.id]
	})
}));

export const domainWebhookRelations = relations(domainWebhook, ({ one }) => ({
	user: one(user, {
		fields: [domainWebhook.userId],
		references: [user.id]
	}),
	domain: one(domain, {
		fields: [domainWebhook.domainId],
		references: [domain.id]
	})
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
	user: one(user, {
		fields: [activityLog.userId],
		references: [user.id]
	})
}));

export const emailEventRelations = relations(emailEvent, ({ one }) => ({
	user: one(user, {
		fields: [emailEvent.userId],
		references: [user.id]
	}),
	template: one(emailTemplate, {
		fields: [emailEvent.templateId],
		references: [emailTemplate.id]
	})
}));

export const webhookLogRelations = relations(webhookLog, ({ one }) => ({
	user: one(user, {
		fields: [webhookLog.userId],
		references: [user.id]
	})
}));

export const emailQueueRelations = relations(emailQueue, ({ one }) => ({
	user: one(user, {
		fields: [emailQueue.userId],
		references: [user.id]
	}),
	domain: one(domain, {
		fields: [emailQueue.domainId],
		references: [domain.id]
	}),
	template: one(emailTemplate, {
		fields: [emailQueue.templateId],
		references: [emailTemplate.id]
	})
}));

export const passwordResetTokenRelations = relations(passwordResetToken, ({ one }) => ({
	user: one(user, {
		fields: [passwordResetToken.userId],
		references: [user.id]
	})
}));

export const packageRelations = relations(package_, ({ many }) => ({
	userBillings: many(userBilling),
	invoices: many(invoice)
}));

export const paymentMethodRelations = relations(paymentMethod, ({ many }) => ({
	userBillings: many(userBilling),
	payments: many(payment)
}));

export const userBillingRelations = relations(userBilling, ({ one, many }) => ({
	user: one(user, {
		fields: [userBilling.userId],
		references: [user.id]
	}),
	package: one(package_, {
		fields: [userBilling.packageId],
		references: [package_.id]
	}),
	paymentMethod: one(paymentMethod, {
		fields: [userBilling.paymentMethodId],
		references: [paymentMethod.id]
	}),
	invoices: many(invoice)
}));

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
	user: one(user, {
		fields: [invoice.userId],
		references: [user.id]
	}),
	userBilling: one(userBilling, {
		fields: [invoice.userBillingId],
		references: [userBilling.id]
	}),
	package: one(package_, {
		fields: [invoice.packageId],
		references: [package_.id]
	}),
	paymentMethod: one(paymentMethod, {
		fields: [invoice.paymentMethodId],
		references: [paymentMethod.id]
	}),
	payments: many(payment)
}));

export const paymentRelations = relations(payment, ({ one }) => ({
	invoice: one(invoice, {
		fields: [payment.invoiceId],
		references: [invoice.id]
	}),
	user: one(user, {
		fields: [payment.userId],
		references: [user.id]
	}),
	paymentMethod: one(paymentMethod, {
		fields: [payment.paymentMethodId],
		references: [paymentMethod.id]
	})
}));

// ============================================
// Type Exports
// ============================================

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type EmailTemplateCategory = typeof emailTemplateCategory.$inferSelect;
export type EmailTemplate = typeof emailTemplate.$inferSelect;
export type EmailTemplateVariable = typeof emailTemplateVariable.$inferSelect;
export type Domain = typeof domain.$inferSelect;
export type SmtpCredential = typeof smtpCredential.$inferSelect;
export type DomainApiKey = typeof domainApiKey.$inferSelect;
export type DomainWebhook = typeof domainWebhook.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
export type EmailEvent = typeof emailEvent.$inferSelect;
export type WebhookLog = typeof webhookLog.$inferSelect;
export type PasswordResetToken = typeof passwordResetToken.$inferSelect;
export type Package = typeof package_.$inferSelect;
export type PaymentMethod = typeof paymentMethod.$inferSelect;
export type UserBilling = typeof userBilling.$inferSelect;
export type Invoice = typeof invoice.$inferSelect;
export type Payment = typeof payment.$inferSelect;
export type EmailQueue = typeof emailQueue.$inferSelect;

// Insert types for convenience
export type NewUser = typeof user.$inferInsert;
export type NewSession = typeof session.$inferInsert;
export type NewEmailTemplateCategory = typeof emailTemplateCategory.$inferInsert;
export type NewEmailTemplate = typeof emailTemplate.$inferInsert;
export type NewEmailTemplateVariable = typeof emailTemplateVariable.$inferInsert;
export type NewDomain = typeof domain.$inferInsert;
export type NewSmtpCredential = typeof smtpCredential.$inferInsert;
export type NewDomainApiKey = typeof domainApiKey.$inferInsert;
export type NewDomainWebhook = typeof domainWebhook.$inferInsert;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type NewEmailEvent = typeof emailEvent.$inferInsert;
export type NewWebhookLog = typeof webhookLog.$inferInsert;
export type NewPasswordResetToken = typeof passwordResetToken.$inferInsert;
export type NewPackage = typeof package_.$inferInsert;
export type NewPaymentMethod = typeof paymentMethod.$inferInsert;
export type NewUserBilling = typeof userBilling.$inferInsert;
export type NewInvoice = typeof invoice.$inferInsert;
export type NewPayment = typeof payment.$inferInsert;
export type NewEmailQueue = typeof emailQueue.$inferInsert;

// ============================================
// Email Tracking Tables
// ============================================

export const emailTrackingLink = pgTable('email_tracking_link', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	messageId: varchar('message_id', { length: 255 }).notNull(),
	recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
	sendingDomain: varchar('sending_domain', { length: 255 }),
	originalUrl: text('original_url').notNull(),
	clickedAt: timestamp('clicked_at', { mode: 'date' }),
	clickCount: integer('click_count').default(0),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
	messageIdx: index('email_tracking_link_message_idx').on(table.messageId),
	userIdx: index('email_tracking_link_user_idx').on(table.userId)
}));

export const emailTrackingOpen = pgTable('email_tracking_open', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	messageId: varchar('message_id', { length: 255 }).notNull(),
	recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
	sendingDomain: varchar('sending_domain', { length: 255 }),
	openedAt: timestamp('opened_at', { mode: 'date' }),
	openCount: integer('open_count').default(0),
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
	messageIdx: index('email_tracking_open_message_idx').on(table.messageId),
	userIdx: index('email_tracking_open_user_idx').on(table.userId)
}));

export const emailTrackingLinkRelations = relations(emailTrackingLink, ({ one }) => ({
	user: one(user, {
		fields: [emailTrackingLink.userId],
		references: [user.id]
	})
}));

export const emailTrackingOpenRelations = relations(emailTrackingOpen, ({ one }) => ({
	user: one(user, {
		fields: [emailTrackingOpen.userId],
		references: [user.id]
	})
}));

export type EmailTrackingLink = typeof emailTrackingLink.$inferSelect;
export type NewEmailTrackingLink = typeof emailTrackingLink.$inferInsert;
export type EmailTrackingOpen = typeof emailTrackingOpen.$inferSelect;
export type NewEmailTrackingOpen = typeof emailTrackingOpen.$inferInsert;

export const notification = pgTable('notification', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	type: varchar('type', { length: 50 }).notNull(), // e.g., 'payment_success', 'invoice_overdue'
	title: varchar('title', { length: 255 }).notNull(),
	message: text('message').notNull(),
	isRead: boolean('is_read').notNull().default(false),
	actionUrl: varchar('action_url', { length: 500 }),
	metadata: text('metadata'), // JSON for extra data
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())
});

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, {
		fields: [notification.userId],
		references: [user.id]
	})
}));

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;

// ============================================
// Email Suppression Tables
// ============================================

export const suppressionReasonEnum = pgEnum('suppression_reason_enum', [
	'hard_bounce',      // Permanent delivery failure
	'soft_bounce',      // Temporary delivery failure (after retries)
	'complaint',        // Spam complaint from recipient
	'unsubscribe',      // Recipient unsubscribed
	'manual'            // Manually added by user
]);

export const emailSuppression = pgTable('email_suppression', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id),
	domainId: varchar('domain_id', { length: 255 }).references(() => domain.id), // Optional: domain-specific suppression
	email: varchar('email', { length: 255 }).notNull(),
	reason: suppressionReasonEnum('reason').notNull(),
	sourceEventId: varchar('source_event_id', { length: 255 }), // Link to triggering event
	metadata: text('metadata'), // JSON: bounce reason, complaint type, etc.
	createdAt: timestamp('created_at', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
	userEmailIdx: uniqueIndex('email_suppression_user_email_idx').on(table.userId, table.email),
	emailIdx: index('email_suppression_email_idx').on(table.email),
	reasonIdx: index('email_suppression_reason_idx').on(table.reason),
}));

export const emailSuppressionRelations = relations(emailSuppression, ({ one }) => ({
	user: one(user, {
		fields: [emailSuppression.userId],
		references: [user.id]
	}),
	domain: one(domain, {
		fields: [emailSuppression.domainId],
		references: [domain.id]
	}),
	sourceEvent: one(emailEvent, {
		fields: [emailSuppression.sourceEventId],
		references: [emailEvent.id]
	})
}));

export type EmailSuppression = typeof emailSuppression.$inferSelect;
export type NewEmailSuppression = typeof emailSuppression.$inferInsert;
