/**
 * OAuth 2.0 configuration for Google Drive API
 * Uses PKCE (Proof Key for Code Exchange) for secure auth without client secret
 */

export const OAUTH_CONFIG = {
  // Google OAuth Client ID - provided via environment variable
  // Users must set GOOGLE_CLIENT_ID in .env file
  clientId: process.env.GOOGLE_CLIENT_ID || '',

  // Client secret - provided via environment variable
  // Users must set GOOGLE_CLIENT_SECRET in .env file
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',

  // OAuth 2.0 endpoints
  endpoints: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    deviceCode: 'https://oauth2.googleapis.com/device/code',
  },

  // Required scopes for Google Drive access
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],

  // Localhost callback configuration
  localhost: {
    host: '127.0.0.1',
    // Port will be randomly selected at runtime
    callbackPath: '/callback',
  },

  // Token storage configuration
  storage: {
    serviceName: 'lighthouse-cli',
    // Account name will be user's email
    configDir: '.config/lighthouse-cli',
    tokenFileName: 'tokens.json',
  },
} as const;

/**
 * Validates that required OAuth configuration is present
 */
export function validateOAuthConfig(): void {
  if (!OAUTH_CONFIG.clientId || !OAUTH_CONFIG.clientSecret) {
    throw new Error(
      '\n❌ Missing OAuth credentials in .env file!\n\n' +
      'Please add your Google OAuth credentials to .env:\n' +
      '  GOOGLE_CLIENT_ID=your_client_id_here\n' +
      '  GOOGLE_CLIENT_SECRET=your_client_secret_here\n\n' +
      'Get OAuth credentials from:\n' +
      '  https://console.cloud.google.com/apis/credentials\n' +
      '  → Create OAuth 2.0 Client ID → Desktop app\n'
    );
  }
}

/**
 * Get the full scopes string for OAuth requests
 */
export function getScopesString(): string {
  return OAUTH_CONFIG.scopes.join(' ');
}

/**
 * Get scopes as mutable array
 */
export function getScopesArray(): string[] {
  return [...OAUTH_CONFIG.scopes];
}
