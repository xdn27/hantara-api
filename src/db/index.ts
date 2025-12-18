import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

// Create PostgreSQL client
const client = postgres(config.database.url, { prepare: false });

// Create Drizzle ORM instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export * from './schema';
