/**
 * CLI command: lh auth:status
 * Display authentication status and information
 */

import { getAuthStatus } from '../../lib/auth/oauth.js';
import { getTokenExpiry } from '../../lib/auth/token-refresh.js';

export async function authStatus() {
  try {
    const status = await getAuthStatus();

    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║      Authentication Status                ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    if (!status.authenticated) {
      console.log('Status:       Not authenticated');
      console.log('\nRun "lh auth:init" to authenticate\n');
      return;
    }

    console.log('Status:       ✔ Authenticated');

    if (status.email) {
      console.log(`Email:        ${status.email}`);
    }

    if (status.storageType) {
      const storageLabel = status.storageType === 'keyring'
        ? 'OS Keyring (secure)'
        : 'File (~/.config/lighthouse-cli/tokens.json)';
      console.log(`Storage:      ${storageLabel}`);
    }

    if (status.scopes && status.scopes.length > 0) {
      console.log('\nAuthorized scopes:');
      for (const scope of status.scopes) {
        const scopeName = scope.split('/').pop() || scope;
        console.log(`  • ${scopeName}`);
      }
    }

    // Get detailed expiry information
    const expiry = await getTokenExpiry();

    if (expiry) {
      console.log('\nToken information:');

      if (expiry.isExpired) {
        console.log('  Status:     ⚠️  Expired (will auto-refresh on next use)');
      } else if (expiry.minutesUntilExpiry !== undefined) {
        if (expiry.minutesUntilExpiry < 5) {
          console.log(`  Status:     ⚠️  Expiring soon (${expiry.minutesUntilExpiry} minutes)`);
        } else if (expiry.minutesUntilExpiry < 60) {
          console.log(`  Status:     ✔ Valid (${expiry.minutesUntilExpiry} minutes remaining)`);
        } else {
          const hours = Math.floor(expiry.minutesUntilExpiry / 60);
          console.log(`  Status:     ✔ Valid (${hours} hours remaining)`);
        }
      }

      if (expiry.expiresAt) {
        console.log(`  Expires:    ${expiry.expiresAt.toLocaleString()}`);
      }
    }

    if (status.lastRefreshed) {
      console.log(`  Last refresh: ${status.lastRefreshed.toLocaleString()}`);
    }

    console.log('\nAvailable commands:');
    console.log('  • Migrate files:  lh migrate drive');
    console.log('  • Logout:         lh auth logout');
    console.log('  • Re-authenticate: lh auth init --force\n');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n✗ Error checking status: ${error.message}\n`);
    } else {
      console.error('\n✗ Unknown error occurred\n');
    }
    process.exit(1);
  }
}
