/**
 * PKCE (Proof Key for Code Exchange) utilities
 * Implements RFC 7636 for secure OAuth 2.0 authorization
 */

import crypto from 'crypto';

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generates a cryptographically random code verifier
 * @returns Base64-URL encoded random string (43-128 characters)
 */
export function generateCodeVerifier(): string {
  // Generate 32 random bytes (will result in 43 chars when base64url encoded)
  const buffer = crypto.randomBytes(32);
  return base64URLEncode(buffer);
}

/**
 * Creates a code challenge from a code verifier using SHA256
 * @param codeVerifier - The code verifier string
 * @returns Base64-URL encoded SHA256 hash of the verifier
 */
export function generateCodeChallenge(codeVerifier: string): string {
  // Create SHA256 hash of the verifier
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64URLEncode(hash);
}

/**
 * Generates a complete PKCE pair (verifier + challenge)
 * @returns Object containing both verifier and challenge
 */
export function generatePKCEPair(): PKCEPair {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Encodes a buffer to Base64-URL format (RFC 4648 §5)
 * Replaces +/= characters to make it URL-safe
 * @param buffer - Buffer to encode
 * @returns Base64-URL encoded string
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Validates a code verifier format
 * Must be 43-128 characters, using [A-Z], [a-z], [0-9], '-', '.', '_', '~'
 */
export function isValidCodeVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }
  // Check for valid characters only
  return /^[A-Za-z0-9\-._~]+$/.test(verifier);
}
