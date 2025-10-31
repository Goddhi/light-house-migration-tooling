/**
 * CLI command: lh auth:init
 * Interactive authentication setup
 */

import prompts from 'prompts';
import type { AuthFlowMethod } from '../../lib/types.js';
import { initialize, isAuthenticated, getUserEmail } from '../../lib/auth/oauth.js';

export async function authInit(options: { device?: boolean; force?: boolean }) {
  try {
    // Check if already authenticated
    if (!options.force && await isAuthenticated()) {
      const email = await getUserEmail();
      console.log(`\n⚠️  Already authenticated${email ? ` as ${email}` : ''}`);
      console.log('Use --force to re-authenticate\n');

      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to re-authenticate?',
        initial: false,
      });

      if (!confirm) {
        console.log('Authentication cancelled');
        return;
      }
    }

    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  Lighthouse CLI - Authentication Setup   ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    let method: AuthFlowMethod | 'auto' = 'auto';

    // If device flag is set, use device flow
    if (options.device) {
      method = 'device';
      console.log('Using device flow (as requested)\n');
    } else {
      // Ask user for preferred method
      const { authMethod } = await prompts({
        type: 'select',
        name: 'authMethod',
        message: 'Choose authentication method:',
        choices: [
          {
            title: 'Quick setup (recommended)',
            description: 'Opens browser automatically on this machine',
            value: 'localhost',
          },
          {
            title: 'Device flow',
            description: 'For headless servers or remote machines',
            value: 'device',
          },
          {
            title: 'Auto-detect',
            description: 'Try quick setup, fallback to device flow',
            value: 'auto',
          },
        ],
        initial: 0,
      });

      if (!authMethod) {
        console.log('\nAuthentication cancelled');
        return;
      }

      method = authMethod;
    }

    // Execute authentication
    await initialize(method);

    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║         Authentication Complete!          ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    console.log('Next steps:');
    console.log('  • Check status:  lh auth status');
    console.log('  • Start migration: lh migrate drive\n');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n✗ Authentication failed: ${error.message}\n`);
    } else {
      console.error('\n✗ Authentication failed with an unknown error\n');
    }
    process.exit(1);
  }
}
