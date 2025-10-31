/**
 * CLI command: lh auth:logout
 * Logout and delete stored tokens
 */

import prompts from 'prompts';
import { logout, isAuthenticated, getUserEmail } from '../../lib/auth/oauth.js';

export async function authLogout(options: { noRevoke?: boolean; force?: boolean }) {
  try {
    // Check if authenticated
    if (!await isAuthenticated()) {
      console.log('\n⚠️  Not currently authenticated\n');
      return;
    }

    const email = await getUserEmail();

    // Confirm logout unless --force is used
    if (!options.force) {
      console.log(`\n⚠️  You are about to logout${email ? ` (${email})` : ''}`);

      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to logout?',
        initial: false,
      });

      if (!confirm) {
        console.log('\nLogout cancelled\n');
        return;
      }
    }

    console.log('\nLogging out...\n');

    // Logout (revoke token unless --no-revoke flag is set)
    await logout(!options.noRevoke);

    console.log('╔═══════════════════════════════════════════╗');
    console.log('║           Logged Out Successfully         ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    console.log('Run "lh auth:init" to authenticate again\n');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n✗ Logout failed: ${error.message}\n`);
    } else {
      console.error('\n✗ Unknown error occurred\n');
    }
    process.exit(1);
  }
}
