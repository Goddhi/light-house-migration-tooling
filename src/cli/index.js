#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';

import { GoogleDriveAuth } from '../lib/auth/googledriveauth.js';
import { FileDiscovery } from '../lib/discovery/filediscovery.js';
import { BinaryFileMigrator } from '../lib/migration/binaryfilemigrator.js';
import { LighthouseClient } from '../lib/lighthouse/lighthouseclient.js';
import { Logger } from '../lib/utils/logger.js';
import { FileUtils } from '../lib/utils/fileutils.js';
import { CLI } from '../config/constants.js';

const program = new Command();
const logger = new Logger('CLI');

class MigrationCLI {
  constructor() {
    this.auth = null;
    this.drive = null;
    this.lighthouse = null;
    this.discovery = null;
    this.migrator = null;
  }

  async initialize() {
    console.log(chalk.cyan.bold('\nBinary-Only Google Drive → Lighthouse Migration Tool'));
    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.yellow('MODE: Binary files only (photos, PDFs, videos, etc.)'));
    console.log(chalk.yellow('SKIPS: Google Docs, Sheets, Slides, and other Workspace files\n'));

    // Check for required environment variables
    const apiKey = process.env.LIGHTHOUSE_API_KEY;
    if (!apiKey) {
      console.error(chalk.red('❌ LIGHTHOUSE_API_KEY environment variable is required'));
      console.log(chalk.gray('Please set your Lighthouse API key:'));
      console.log(chalk.gray('export LIGHTHOUSE_API_KEY=your_api_key_here\n'));
      process.exit(1);
    }

    // Initialize clients
    this.lighthouse = new LighthouseClient(apiKey);
    this.auth = new GoogleDriveAuth();
  }

  async authenticate() {
    const spinner = ora('Authenticating with Google Drive...').start();
    
    try {
      this.drive = await this.auth.authenticate();
      this.discovery = new FileDiscovery(this.drive);
      this.migrator = new BinaryFileMigrator(this.drive, this.lighthouse);
      
      spinner.succeed('Google Drive authenticated successfully');
      
      // Get user info
      const userInfo = await this.auth.getUserInfo();
      console.log(chalk.gray(`Authenticated as: ${userInfo.user.emailAddress}`));
      
    } catch (error) {
      spinner.fail('Google Drive authentication failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  async validateApiKey() {
    const spinner = ora('Validating Lighthouse API key...').start();
    
    try {
      const isValid = await this.lighthouse.validateApiKey();
      if (!isValid) {
        throw new Error('Invalid Lighthouse API key');
      }
      
      const storageInfo = await this.lighthouse.getStorageInfo();
      spinner.succeed('Lighthouse API key validated');
      
      console.log(chalk.gray(`Storage: ${FileUtils.formatBytes(storageInfo.dataUsed)} / ${FileUtils.formatBytes(storageInfo.dataLimit)} (${storageInfo.utilizationPercent.toFixed(1)}% used)`));
      
    } catch (error) {
      spinner.fail('Lighthouse API key validation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  async discoverFiles(folderId) {
    const spinner = ora('Discovering files in Google Drive...').start();
    
    try {
      const results = await this.discovery.discoverFiles({
        folderId,
        includeSharedDrives: true,
        onProgress: (progress) => {
          spinner.text = `Discovering files... ${progress.filesFound} found`;
        }
      });

      spinner.succeed(`File discovery completed`);
      
      // Display discovery results
      console.log(chalk.cyan('\nFile Discovery Results:'));
      console.log(`Total files found: ${chalk.bold(results.statistics.overall.totalFiles)}`);
      console.log(`Binary files (will migrate): ${chalk.green.bold(results.statistics.binary.count)}`);
      console.log(`Google Workspace files (will skip): ${chalk.yellow.bold(results.statistics.workspace.count)}`);
      
      if (results.statistics.workspace.count > 0) {
        console.log(chalk.yellow('\nSkipped file types:'));
        Object.entries(results.statistics.workspace.typeBreakdown).forEach(([type, count]) => {
          console.log(`  ${type}: ${count} files`);
        });
      }

      if (results.statistics.binary.totalSize > 0) {
        console.log(chalk.gray(`\nTotal size to migrate: ${FileUtils.formatBytes(results.statistics.binary.totalSize)}`));
      }

      return results;
      
    } catch (error) {
      spinner.fail('File discovery failed');
      throw error;
    }
  }

  async confirmMigration(binaryFiles, workspaceFiles) {
    if (binaryFiles.length === 0) {
      console.log(chalk.yellow('\nNo binary files found to migrate.'));
      if (workspaceFiles.length > 0) {
        console.log(chalk.yellow(`Found ${workspaceFiles.length} Google Workspace files, but they are skipped in binary-only mode.`));
        console.log(chalk.gray('To migrate Google Docs/Sheets/Slides, you would need a different tool'));
        console.log(chalk.gray('that handles Google Workspace export functionality.'));
      }
      process.exit(0);
    }

    console.log(chalk.cyan(`\nReady to migrate ${binaryFiles.length} binary files`));
    
    if (workspaceFiles.length > 0) {
      console.log(chalk.yellow(`Note: ${workspaceFiles.length} Google Workspace files will be skipped`));
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Proceed with migration?',
        default: false
      }
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('Migration cancelled'));
      process.exit(0);
    }
  }

  async performMigration(binaryFiles) {
    const startTime = Date.now();
    console.log(chalk.cyan('\nStarting migration...\n'));

    const progressBar = ora('Initializing migration...').start();
    let lastProgressUpdate = 0;

    try {
      const results = await this.migrator.migrateFiles(binaryFiles, {
        batchSize: 3,
        validateQuota: true,
        onProgress: (progress) => {
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) { // Update every second
            const percentage = progress.percentage;
            const rate = progress.rate;
            const eta = progress.estimatedTimeRemaining;
            
            let progressText = `Migrating files: ${progress.completed}/${progress.total} (${percentage}%)`;
            if (rate > 0) progressText += ` • ${rate.toFixed(1)} files/min`;
            if (eta) progressText += ` • ETA: ${FileUtils.formatDuration(eta)}`;
            
            progressBar.text = progressText;
            lastProgressUpdate = now;
          }
        },
        onFileComplete: (result) => {
          if (result.result.migration?.success) {
            // Optionally log individual successes
          } else {
            console.log(chalk.red(`❌ ${result.file.name}: ${result.result.error?.message}`));
          }
        }
      });

      progressBar.succeed('Migration completed!');

      // Display results
      this.displayResults(results, Date.now() - startTime);
      
      // Save report
      await this.saveReport(results);
      
    } catch (error) {
      progressBar.fail('Migration failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  displayResults(results, totalDuration) {
    const { summary, lighthouse } = results;
    
    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan.bold('Migration Results'));
    console.log(chalk.cyan('='.repeat(50)));
    
    console.log(`${chalk.green('✅ Successfully migrated:')} ${summary.completed} files`);
    console.log(`${chalk.red('❌ Failed:')} ${summary.failed} files`);
    console.log(`${chalk.yellow('⏭️  Skipped (Google Workspace):')} ${summary.skipped || 0} files`);
    console.log(`${chalk.blue('📊 Success rate:')} ${summary.successRate}`);
    console.log(`${chalk.blue('📁 Data transferred:')} ${FileUtils.formatBytes(summary.totalBytes)}`);
    console.log(`${chalk.blue('⏱️  Duration:')} ${FileUtils.formatDuration(summary.duration)}`);
    
    if (lighthouse.uploadStats.averageThroughput > 0) {
      console.log(`${chalk.blue('🚀 Average throughput:')} ${lighthouse.uploadStats.formattedThroughput}`);
    }

    console.log(chalk.cyan('\n' + '='.repeat(50)));
    
    if (summary.failed > 0) {
      console.log(chalk.yellow('\n⚠️  Some files failed to migrate. Check the detailed report for more information.'));
    }
    
    if (summary.skipped && summary.skipped > 0) {
      console.log(chalk.yellow(`\n⚠️  ${summary.skipped} Google Workspace files were skipped.`));
      console.log(chalk.gray('   To migrate Google Docs/Sheets/Slides, you would need a different tool'));
      console.log(chalk.gray('   that handles Google Workspace export functionality.'));
    }
  }

  async saveReport(results) {
    const reportPath = 'binary-migration-report.json';
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
      console.log(chalk.green(`\n📋 Detailed report saved: ${reportPath}`));
    } catch (error) {
      console.error(chalk.red(`Failed to save report: ${error.message}`));
    }
  }

  async run(folderId) {
    try {
      await this.initialize();
      await this.authenticate();
      await this.validateApiKey();
      
      const discovery = await this.discoverFiles(folderId);
      await this.confirmMigration(discovery.binaryFiles, discovery.workspaceFiles);
      await this.performMigration(discovery.binaryFiles);
      
    } catch (error) {
      logger.error('Migration failed', error);
      console.error(chalk.red(`\nMigration failed: ${error.message}`));
      process.exit(1);
    }
  }
}

// CLI Command setup
program
  .name(CLI.APP_NAME)
  .version(CLI.VERSION)
  .description(CLI.DESCRIPTION);

program
  .argument('[folderId]', 'Optional Google Drive folder ID to migrate (if omitted, migrates entire drive)')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress non-essential output')
  .option('--batch-size <size>', 'Number of files to process concurrently (default: 3)', '3')
  .option('--no-quota-check', 'Skip storage quota validation')
  .action(async (folderId, options) => {
    // Set log level
    if (options.verbose) {
      process.env.LOG_LEVEL = 'debug';
    } else if (options.quiet) {
      process.env.LOG_LEVEL = 'error';
    }

    const cli = new MigrationCLI();
    await cli.run(folderId);
  });

program
  .command('validate')
  .description('Validate Google Drive and Lighthouse credentials without migrating')
  .action(async () => {
    const cli = new MigrationCLI();
    await cli.initialize();
    await cli.authenticate();
    await cli.validateApiKey();
    console.log(chalk.green('\n✅ All credentials validated successfully!'));
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stdout.write(chalk.red(str))
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nReceived SIGINT. Gracefully shutting down...'));
  process.exit(0);
});

program.parse();

