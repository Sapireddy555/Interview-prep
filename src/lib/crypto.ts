import crypto from 'crypto';

// Enforce a 32-byte key from CRYPTO_MASTER_KEY, or derive one deterministically in dev mode
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard IV length

function getMasterKey(): Buffer {
  const envKey = process.env.CRYPTO_MASTER_KEY;
  if (!envKey) {
    // Dev fallback: Derive a deterministic key from a salt
    // In production, CRYPTO_MASTER_KEY must be a cryptographically secure 32-byte string
    console.warn("WARNING: CRYPTO_MASTER_KEY is not defined. Using a deterministic fallback key for development.");
    return crypto.scryptSync('proprep-fallback-passphrase-2026', 'salt-proprep-1234', 32);
  }

  // If the key is already 32 bytes, return it directly. Otherwise, hash it to ensure 32 bytes.
  if (Buffer.from(envKey, 'hex').length === 32) {
    return Buffer.from(envKey, 'hex');
  }
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Encrypts plain text using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:ciphertext_hex
 */
export function encryptField(plainText: string | null | undefined): string {
  if (!plainText) return '';
  
  try {
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');
    
    return `${ivHex}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error("Encryption failed:", error);
    return plainText; // Fallback to avoid database failures
  }
}

/**
 * Decrypts AES-256-GCM encrypted text.
 * Gracefully returns the input text if it's not in the encrypted format (supporting legacy data).
 */
export function decryptField(encryptedText: string | null | undefined): string {
  if (!encryptedText) return '';
  
  try {
    const parts = encryptedText.split(':');
    // AES-256-GCM format must contain exactly 3 segments: iv, authTag, ciphertext
    if (parts.length !== 3) {
      return encryptedText; // Treat as legacy unencrypted data
    }
    
    const [ivHex, authTagHex, ciphertextHex] = parts;
    if (ivHex.length !== 24 || authTagHex.length !== 32) {
      return encryptedText; // Invalid format size, treat as legacy text
    }
    
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // If decryption fails (e.g. wrong key, bad data), return original to degrade gracefully
    console.error("Decryption failed (checking if legacy field):", error);
    return encryptedText;
  }
}
