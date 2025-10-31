/**
 * Unified OAuth interface
 * Main entry point for authentication operations
 */

import { google } from 'googleapis';
import type { OAuthTokens, AuthStatus, AuthFlowMethod } from '../types.js';
import { validateOAuthConfig, OAUTH_CONFIG, getScopesArray } from '../../config/oauth.js';
import { executeLocalhostFlow } from './localhost-flow.js';
import { executeDeviceFlow } from './device-flow.js';
import { storeTokens, retrieveTokens, deleteTokens, getStorageType } from './token-storage.js';
import { getValidAccessToken, getTokenExpiry } from './token-refresh.js';

/**
 * Initialize authentication (main auth flow)
 * Tries localhost first, falls back to device flow if needed
 * @param preferredMethod - Preferred auth method, or auto-detect
 * @returns OAuth tokens
 */
export async function initialize(
  preferredMethod: AuthFlowMethod | 'auto' = 'auto'
): Promise<OAuthTokens> {
  // Validate configuration
  validateOAuthConfig();

  let tokens: OAuthTokens;

  if (preferredMethod === 'device') {
    // User explicitly wants device flow
    tokens = await executeDeviceFlow();
  } else if (preferredMethod === 'localhost') {
    // User explicitly wants localhost
    tokens = await executeLocalhostFlow();
  } else {
    // Auto-detect: try localhost first, fall back to device flow
    try {
      tokens = await executeLocalhostFlow();
    } catch (error) {
      console.warn('⚠️  Localhost flow failed, trying device flow...\n');
      tokens = await executeDeviceFlow();
    }
  }

  // Extract email from ID token if available
  let email: string | undefined;
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()
      );
      email = payload.email;
    } catch (error) {
      // ID token parsing failed, email will be undefined
    }
  }

  // Store tokens
  const storageType = await storeTokens(tokens, email, getScopesArray());

  console.log('✔ Authentication successful!');
  if (email) {
    console.log(`✔ Logged in as: ${email}`);
  }
  console.log(`✔ Tokens stored in: ${storageType}`);

  const expiry = await getTokenExpiry();
  if (expiry && expiry.expiresAt) {
    console.log(`✔ Access token expires: ${expiry.expiresAt.toLocaleString()}`);
  }

  return tokens;
}

/**
 * Get authentication status
 * @returns Auth status information
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const data = await retrieveTokens();

  if (!data) {
    return { authenticated: false };
  }

  const expiry = await getTokenExpiry();
  const storageType = await getStorageType(data.email);

  return {
    authenticated: true,
    email: data.email,
    scopes: data.scopes,
    expiresAt: expiry?.expiresAt,
    storageType: storageType || undefined,
    lastRefreshed: data.lastRefreshedAt ? new Date(data.lastRefreshedAt) : undefined,
  };
}

/**
 * Logout (delete stored tokens)
 * @param revokeToken - Whether to also revoke the token with Google
 */
export async function logout(revokeToken = true): Promise<void> {
  const data = await retrieveTokens();

  if (!data) {
    console.log('⚠️  No active session found');
    return;
  }

  // Optionally revoke token with Google
  if (revokeToken && data.tokens.access_token) {
    try {
      const response = await fetch(
        `${OAUTH_CONFIG.endpoints.revoke}?token=${data.tokens.access_token}`,
        { method: 'POST' }
      );

      if (response.ok) {
        console.log('✔ Token revoked with Google');
      }
    } catch (error) {
      console.warn('⚠️  Could not revoke token with Google');
    }
  }

  // Delete local tokens
  await deleteTokens(data.email);
  console.log('✔ Local tokens deleted');
  console.log('✔ Logged out successfully');
}

/**
 * Get an authenticated Google Drive client
 * This is the main function to use before making Drive API calls
 * @returns Authenticated Drive client
 */
export async function getDriveClient() {
  const accessToken = await getValidAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const data = await retrieveTokens();
  return data !== null;
}

/**
 * Get user email from stored tokens
 */
export async function getUserEmail(): Promise<string | null> {
  const data = await retrieveTokens();
  return data?.email || null;
}
