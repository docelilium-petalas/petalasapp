// AES-256-GCM encryption for sensitive fields stored in the database (integration secrets, webhook tokens).
// Requires ENCRYPTION_KEY env var: openssl rand -base64 32
// Uses the Web Crypto API — compatible with Node.js 18+ and Edge Runtime.

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is required')
  const keyBytes = Buffer.from(raw, 'base64')
  if (keyBytes.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte base64 string (use: openssl rand -base64 32)')
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, ['encrypt', 'decrypt'])
}

export async function encryptField(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded)
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)
  return Buffer.from(combined).toString('base64')
}

export async function decryptField(encrypted: string): Promise<string> {
  const key = await getKey()
  const combined = Buffer.from(encrypted, 'base64')
  const iv = combined.subarray(0, IV_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH)
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}
