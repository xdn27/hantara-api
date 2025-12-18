import { createHash, randomBytes } from 'crypto';

/**
 * Generate a new API key with prefix
 * Returns both the plain key (to show user once) and the hash (to store)
 */
export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  // Generate 32 random bytes and encode as base64url
  const bytes = randomBytes(32);
  const key = 'hm_' + bytes.toString('base64url');

  // Create hash for storage
  const keyHash = hashApiKey(key);

  // Store first 12 chars as prefix for display
  const keyPrefix = key.substring(0, 12);

  return { key, keyHash, keyPrefix };
}

/**
 * Hash an API key for secure storage using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Verify an API key against a stored hash
 */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const keyHash = hashApiKey(key);
  return keyHash === storedHash;
}
