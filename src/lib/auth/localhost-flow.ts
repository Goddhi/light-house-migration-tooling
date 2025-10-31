/**
 * Localhost callback flow for OAuth 2.0 with PKCE
 * Starts a local web server to receive the authorization code
 */

import http from 'http';
import { URL } from 'url';
import type { OAuthTokens } from '../types.js';
import { OAUTH_CONFIG, getScopesString } from '../../config/oauth.js';
import { generatePKCEPair } from './pkce.js';
import open from 'open';

/**
 * HTML response pages
 */
const SUCCESS_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    .success {
      color: #22c55e;
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #1f2937;
      margin-bottom: 0.5rem;
    }
    p {
      color: #6b7280;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">✓</div>
    <h1>Authentication Successful!</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>
`;

const ERROR_HTML = (error: string) => `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    .error {
      color: #ef4444;
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #1f2937;
      margin-bottom: 0.5rem;
    }
    p {
      color: #6b7280;
      line-height: 1.6;
    }
    code {
      background: #f3f4f6;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error">✗</div>
    <h1>Authentication Failed</h1>
    <p>Error: <code>${error}</code></p>
    <p>Please try again from the terminal.</p>
  </div>
</body>
</html>
`;

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    code,
    client_id: OAUTH_CONFIG.clientId,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  // Add client secret if available (though not needed for PKCE)
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
    throw new Error(`Token exchange failed: ${error.error || response.statusText}`);
  }

  const data = await response.json();

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
 * Start local server and wait for OAuth callback
 */
function startCallbackServer(
  codeVerifier: string,
  onServerReady: (port: number) => void
): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);

      // Handle callback request
      if (url.pathname === OAUTH_CONFIG.localhost.callbackPath) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(ERROR_HTML(error));
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(ERROR_HTML('No authorization code received'));
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        // Exchange code for tokens
        try {
          const port = (server.address() as any).port;
          const redirectUri = `http://${OAUTH_CONFIG.localhost.host}:${port}${OAUTH_CONFIG.localhost.callbackPath}`;
          const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(SUCCESS_HTML);

          server.close();
          resolve(tokens);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(ERROR_HTML(errorMsg));
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Listen on random available port
    server.listen(0, OAUTH_CONFIG.localhost.host, () => {
      const address = server.address() as any;
      console.log(`🔐 Callback server listening on http://${address.address}:${address.port}`);
      onServerReady(address.port);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout - no response received'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Build authorization URL
 */
function buildAuthUrl(codeChallenge: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: getScopesString(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline', // Request refresh token
    prompt: 'consent', // Force consent screen to ensure refresh token
  });

  return `${OAUTH_CONFIG.endpoints.authorization}?${params.toString()}`;
}

/**
 * Execute localhost OAuth flow
 * @param autoOpen - Whether to automatically open the browser
 * @returns OAuth tokens
 */
export async function executeLocalhostFlow(autoOpen = true): Promise<OAuthTokens> {
  console.log('\n🔐 Starting OAuth authentication...\n');

  // Generate PKCE pair
  const { codeVerifier, codeChallenge } = generatePKCEPair();

  // Start callback server with a callback to get the port when ready
  const tokensPromise = new Promise<OAuthTokens>((resolve, reject) => {
    startCallbackServer(codeVerifier, async (port) => {
      // Server is ready, build auth URL with the actual port
      const redirectUri = `http://${OAUTH_CONFIG.localhost.host}:${port}${OAUTH_CONFIG.localhost.callbackPath}`;
      const authUrl = buildAuthUrl(codeChallenge, redirectUri);

      console.log('Opening browser for authorization...\n');
      console.log('If the browser doesn\'t open automatically, visit this URL:\n');
      console.log(authUrl);
      console.log();

      if (autoOpen) {
        try {
          await open(authUrl);
        } catch (error) {
          console.warn('⚠️  Could not open browser automatically');
        }
      }

      console.log('⏳ Waiting for authorization...\n');
    })
      .then(resolve)
      .catch(reject);
  });

  return await tokensPromise;
}

/**
 * Helper to just build and show the URL without starting server
 * (For manual flow or debugging)
 */
export function getAuthorizationUrl(codeChallenge: string, port: number): string {
  const redirectUri = `http://${OAUTH_CONFIG.localhost.host}:${port}${OAUTH_CONFIG.localhost.callbackPath}`;
  return buildAuthUrl(codeChallenge, redirectUri);
}
