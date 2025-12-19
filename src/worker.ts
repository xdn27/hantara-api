/**
 * Worker Entry Point
 * 
 * Run this file separately from the API server to process background jobs.
 * 
 * Usage: bun run src/worker.ts
 */

import { createEmailWorker } from './workers/email';

console.log('🚀 Starting workers...');

// Create email worker
const emailWorker = createEmailWorker();

// Graceful shutdown
const shutdown = async () => {
  console.log('\n⏳ Shutting down workers...');
  
  await emailWorker.close();
  
  console.log('✅ Workers shut down gracefully');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('✅ All workers running. Press Ctrl+C to stop.');
