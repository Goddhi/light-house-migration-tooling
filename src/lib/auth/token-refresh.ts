/**
 * Token refresh logic for automatic access token renewal
 * Handles expired tokens and refresh token rotation
 */

import type { OAuthTokens } from '../types.js';
import { OAUTH_CONFIG } from '../../config/oauth.js';
import { retrieveTokens, updateTokens } from './token-storage.js';

/**
 * Check if access token is expired or near expiry
 * @param expiryDate - Unix timestamp in milliseconds
 * @param bufferMinutes - Minutes before expiry to consider it expired (default: 5)
 */
export function isTokenExpired(expiryDate?: number, bufferMinutes = 5): boolean {
  if (!expiryDate) return true;

  const now = Date.now();
  const bufferMs = bufferMinutes * 60 * 1000;
  return now >= (expiryDate - bufferMs);
}

/**
 * Refresh access token using refresh token
 * @param refreshToken - The refresh token
 * @returns New OAuth tokens
 */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  // Add client secret if available (for non-PKCE flows)
  if (OAUTH_CONFIG.clientSecret) {
    params.append('client_secret', OAUTH_CONFIG.clientSecret);
  }

  const response = await fetch(OAUTH_CONFIG.endpoints.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown' }));

    // Handle specific error cases
    if (error.error === 'invalid_grant') {
      throw new Error(
        'Refresh token is invalid or expired. Please run "lh auth:init" to re-authenticate.'
      );
    }

    throw new Error(`Token refresh failed: ${error.error || response.statusText}`);
  }

  const data = await response.json();

  // Calculate expiry date if expires_in is provided
  const expiryDate = data.expires_in
    ? Date.now() + data.expires_in * 1000
    : undefined;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // Google may rotate refresh token
    scope: data.scope,
    token_type: data.token_type || 'Bearer',
    expiry_date: expiryDate,
    id_token: data.id_token,
  };
}

/**
 * Get valid access token, refreshing if necessary
 * This is the main function to use before making API calls
 * @returns Valid access token
 */
export async function getValidAccessToken(): Promise<string> {
  const storedData = await retrieveTokens();

  if (!storedData) {
    throw new Error(
      'No authentication found. Please run "lh auth:init" to authenticate.'
    );
  }

  const { tokens } = storedData;

  // Check if token needs refresh
  if (!isTokenExpired(tokens.expiry_date)) {
    // Token is still valid
    return tokens.access_token;
  }

  // Token expired, need to refresh
  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token available. Please run "lh auth:init" to re-authenticate.'
    );
  }

  console.log('🔄 Access token expired, refreshing...');

  try {
    const newTokens = await refreshAccessToken(tokens.refresh_token);

    // Update stored tokens
    await updateTokens(newTokens);

    console.log('✔ Access token refreshed successfully');

    return newTokens.access_token;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to refresh access token');
  }
}

/**
 * Manually refresh tokens (for CLI command)
 * @returns New tokens or null if no refresh token available
 */
export async function manualRefresh(): Promise<OAuthTokens | null> {
  const storedData = await retrieveTokens();

  if (!storedData || !storedData.tokens.refresh_token) {
    return null;
  }

  const newTokens = await refreshAccessToken(storedData.tokens.refresh_token);
  await updateTokens(newTokens);

  return newTokens;
}

/**
 * Get token expiry information
 */
export async function getTokenExpiry(): Promise<{
  expiresAt?: Date;
  isExpired: boolean;
  minutesUntilExpiry?: number;
} | null> {
  const storedData = await retrieveTokens();

  if (!storedData || !storedData.tokens.expiry_date) {
    return null;
  }

  const expiryDate = storedData.tokens.expiry_date;
  const expiresAt = new Date(expiryDate);
  const isExpired = isTokenExpired(expiryDate, 0); // No buffer for this check
  const minutesUntilExpiry = !isExpired
    ? Math.floor((expiryDate - Date.now()) / 60000)
    : undefined;

  return {
    expiresAt,
    isExpired,
    minutesUntilExpiry,
  };
}
