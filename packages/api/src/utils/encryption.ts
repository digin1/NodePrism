import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get or derive the encryption key from the environment.
 * Falls back to JWT_SECRET if ENCRYPTION_KEY is not set.
 * Returns null if neither is available (encryption disabled).
 */
function getEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) return null;

  // Derive a consistent 256-bit key from the secret using SHA-256
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string in the format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext; // No key = no encryption (dev mode)

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `enc:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string. Returns the original plaintext.
 * If the input is not encrypted (no 'enc:' prefix), returns as-is.
 */
export function decrypt(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith('enc:')) {
    return encrypted; // Not encrypted, return as-is (backwards compatible)
  }

  const key = getEncryptionKey();
  if (!key) {
    logger.warn('Cannot decrypt: no encryption key available');
    return encrypted;
  }

  try {
    const parts = encrypted.split(':');
    if (parts.length !== 4) {
      logger.warn('Invalid encrypted format');
      return encrypted;
    }

    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const ciphertext = parts[3];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', { error: (error as Error).message });
    return encrypted; // Return raw value on failure (key rotation, etc.)
  }
}

// Sensitive keys in notification channel config that should be encrypted
const SENSITIVE_CONFIG_KEYS = ['password', 'secret', 'token', 'botToken', 'routingKey', 'apiKey', 'webhookUrl'];

/**
 * Encrypt sensitive fields in a notification channel config object.
 */
export function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (key in result && typeof result[key] === 'string') {
      result[key] = encrypt(result[key] as string);
    }
  }
  return result;
}

/**
 * Decrypt sensitive fields in a notification channel config object.
 */
export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (key in result && typeof result[key] === 'string') {
      result[key] = decrypt(result[key] as string);
    }
  }
  return result;
}
