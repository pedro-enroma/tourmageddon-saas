/**
 * Encryption utilities for sensitive data
 * Uses Web Crypto API for browser and Node.js compatibility
 */

// Note: In production, use a proper key management service (KMS)
// This is a basic implementation for demonstration

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM

/**
 * Generate a cryptographic key from a password
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  // Derive the actual key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Generate a random salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

/**
 * Generate a random IV
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encrypt sensitive data
 * Returns a base64-encoded string containing salt, IV, and ciphertext
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)

  const salt = generateSalt()
  const iv = generateIV()
  const key = await deriveKey(password, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    data
  )

  // Combine salt + IV + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  return arrayBufferToBase64(combined.buffer)
}

/**
 * Decrypt sensitive data
 * Input should be the output from encrypt()
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  const combined = base64ToUint8Array(encryptedData)

  // Extract salt, IV, and ciphertext
  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 16 + IV_LENGTH)
  const ciphertext = combined.slice(16 + IV_LENGTH)

  const key = await deriveKey(password, salt)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/**
 * Hash a value using SHA-256
 * Useful for creating non-reversible identifiers
 */
export async function hash(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return arrayBufferToBase64(hashBuffer)
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return arrayBufferToBase64(bytes.buffer)
}

/**
 * Generate a random API key
 */
export function generateApiKey(): string {
  const prefix = 'tk_'
  const token = generateSecureToken(24)
  return prefix + token.replace(/[+/=]/g, '') // Remove characters that could cause issues in URLs
}

// ============================================
// Field-level encryption helpers
// ============================================

/**
 * Encrypt sensitive fields in an object
 */
export async function encryptSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  sensitiveFields: (keyof T)[],
  encryptionKey: string
): Promise<T> {
  const encrypted = { ...data }

  for (const field of sensitiveFields) {
    const value = data[field]
    if (typeof value === 'string' && value) {
      (encrypted as Record<string, unknown>)[field as string] = await encrypt(value, encryptionKey)
    }
  }

  return encrypted
}

/**
 * Decrypt sensitive fields in an object
 */
export async function decryptSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  sensitiveFields: (keyof T)[],
  encryptionKey: string
): Promise<T> {
  const decrypted = { ...data }

  for (const field of sensitiveFields) {
    const value = data[field]
    if (typeof value === 'string' && value) {
      try {
        (decrypted as Record<string, unknown>)[field as string] = await decrypt(value, encryptionKey)
      } catch {
        // If decryption fails, the field might not be encrypted
        // Keep the original value
      }
    }
  }

  return decrypted
}
