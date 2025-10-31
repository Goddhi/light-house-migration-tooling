/**
 * Device flow for OAuth 2.0 (for limited-input or headless environments)
 * User authorizes on a separate device by visiting a URL and entering a code
 */

import type { OAuthTokens, DeviceCodeResponse } from '../types.js';
import { OAUTH_CONFIG, getScopesString } from '../../config/oauth.js';

/**
 * Request a device code from Google
 */
async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    scope: getScopesString(),
  });

  const response = await fetch(OAUTH_CONFIG.endpoints.deviceCode, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown' }));
    throw new Error(`Device code request failed: ${error.error || response.statusText}`);
  }

  return await response.json();
}

/**
 * Poll for token using device code
 */
async function pollForToken(
  deviceCode: string,
  interval: number
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

  // Add client secret if available
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

  const data = await response.json();

  if (!response.ok) {
    // These errors are expected during polling
    if (data.error === 'authorization_pending') {
      throw new Error('PENDING'); // Special error to continue polling
    }
    if (data.error === 'slow_down') {
      // Google wants us to slow down our polling
      throw new Error('SLOW_DOWN');
    }

    // Other errors are fatal
    throw new Error(`Token polling failed: ${data.error || response.statusText}`);
  }

  // Calculate expiry date
  const expiryDate = data.expires_in
    ? Date.now() + data.expires_in * 1000
    : undefined;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    scope: data.scope,
    token_type: data.token_type || 'Bearer',
    expiry_date: expiryDate,
    id_token: data.id_token,
  };
}

/**
 * Execute device flow authentication
 * @returns OAuth tokens
 */
export async function executeDeviceFlow(): Promise<OAuthTokens> {
  console.log('\n🔐 Starting device flow authentication...\n');

  // Step 1: Request device code
  const deviceCodeData = await requestDeviceCode();

  // Step 2: Display instructions to user
  console.log('To authenticate, follow these steps:\n');
  console.log(`1. Visit: ${deviceCodeData.verification_url}`);
  console.log(`2. Enter code: ${deviceCodeData.user_code}\n`);
  console.log('⏳ Waiting for authorization...\n');

  // Step 3: Poll for token
  const pollInterval = (deviceCodeData.interval || 5) * 1000; // Convert to milliseconds
  const expiresAt = Date.now() + deviceCodeData.expires_in * 1000;
  let currentInterval = pollInterval;

  while (Date.now() < expiresAt) {
    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, currentInterval));

    try {
      const tokens = await pollForToken(deviceCodeData.device_code, deviceCodeData.interval);
      console.log('✔ Authorization successful!\n');
      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'PENDING') {
          // Continue polling
          continue;
        }
        if (error.message === 'SLOW_DOWN') {
          // Google wants us to slow down
          currentInterval += 1000; // Add 1 second
          continue;
        }
        // Fatal error
        throw error;
      }
      throw new Error('Unknown error during device flow');
    }
  }

  throw new Error('Device code expired. Please try again.');
}

/**
 * Check if device flow is supported for the current OAuth client
 * (Some OAuth clients may not have device flow enabled)
 */
export async function isDeviceFlowSupported(): Promise<boolean> {
  try {
    // Try to request a device code
    await requestDeviceCode();
    return true;
  } catch (error) {
    // If we get an error about device flow not being supported, return false
    if (error instanceof Error && error.message.includes('unauthorized_client')) {
      return false;
    }
    // Other errors might be temporary, so assume supported
    return true;
  }
}
