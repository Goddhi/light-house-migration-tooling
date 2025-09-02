import { MIGRATION, ERRORS } from '../../config/constants.js';
import { Logger } from '../utils/logger.js';
import { FileUtils } from '../utils/fileutils.js';
import { ProgressTracker } from './progresstrack.js';

export class BinaryFileMigrator {
  constructor(driveClient, lighthouseClient) {
    this.drive = driveClient;
    this.lighthouse = lighthouseClient;
    this.logger = new Logger('BinaryFileMigrator');
    this.progress = new ProgressTracker();

    this.migrations = [];
    this.failures = [];
    this.isRunning = false;
    this.shouldStop = false;
  }

  async migrateFiles(files, options = {}) {
    const {
      batchSize = MIGRATION.DEFAULT_BATCH_SIZE,
      onProgress,
      onFileComplete,
      validateQuota = true
    } = options;

    this.logger.info(`Starting migration of ${files.length} files`, {
      batchSize,
      validateQuota
    });

    try {
      this.isRunning = true;
      this.shouldStop = false;
      this.progress.start(files.length);

      if (validateQuota) {
        await this.validateStorageQuota(files);
      }

      await this.processBatches(files, batchSize, onProgress, onFileComplete);

      const results = this.generateResults();
      this.logger.info('Migration completed', {
        successful: results.summary.completed,
        failed: results.summary.failed,
        duration: results.summary.duration
      });

      return results;
    } catch (error) {
      this.logger.error('Migration failed', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.progress.complete();
    }
  }

  async validateStorageQuota(files) {
    const totalBytes = files.reduce((sum, file) =>
      sum + parseInt(file.size || '0', 10), 0
    );

    if (totalBytes === 0) {
      this.logger.warn('No file sizes available for quota validation');
      return;
    }

    const quotaCheck = await this.lighthouse.checkStorageQuota(totalBytes);

    if (!quotaCheck.sufficient) {
      const error = new Error(
        `Insufficient storage quota. Required: ${FileUtils.formatBytes(quotaCheck.required)}, ` +
        `Available: ${FileUtils.formatBytes(quotaCheck.available)}`
      );
      error.code = 'INSUFFICIENT_QUOTA';
      throw error;
    }

    this.logger.info('Storage quota validation passed', {
      required: FileUtils.formatBytes(quotaCheck.required ?? totalBytes),
      available: FileUtils.formatBytes(quotaCheck.available ?? 0)
    });
  }

  async processBatches(files, batchSize, onProgress, onFileComplete) {
    for (let i = 0; i < files.length && !this.shouldStop; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      this.logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
        start: i,
        end: Math.min(i + batchSize, files.length),
        total: files.length
      });

      const batchPromises = batch.map(file => this.migrateFile(file, onFileComplete));
      await Promise.allSettled(batchPromises);

      if (onProgress) {
        onProgress(this.progress.getStatus());
      }

      if (i + batchSize < files.length && !this.shouldStop) {
        await this.rateLimitDelay();
      }
    }
  }

  async migrateFile(file, onFileComplete) {
    const startTime = Date.now();

    try {
      this.logger.debug(`Starting migration: ${file.name}`, {
        id: file.id,
        size: file.size,
        mimeType: file.mimeType
      });

      this.progress.updateCurrent(file.name);

      // Download from Drive to buffer
      const stream = await this.retry(
        () => this.downloadFile(file),
        { retries: 3, baseMs: 1500, label: `download:${file.name}` }
      );      const buffer = await this.streamToBuffer(stream, file);

      // Upload to Lighthouse (expects uploadBuffer(buffer, fileName, mimeType, onProgress?))
      const { cid, size } = await this.lighthouse.uploadBuffer(
        buffer,
        file.name,
        file.mimeType,
        /* onProgress */ null
      );

      const migration = {
        googleFile: {
          id: file.id,
          name: file.name,
          size: parseInt(file.size || '0', 10),
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime
        },
        lighthouse: {
          cid,
          size: size ?? buffer.length,
          gatewayUrl: `https://gateway.lighthouse.storage/ipfs/${cid}`
        },
        migration: {
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          success: true
        }
      };

      this.migrations.push(migration);
      this.progress.incrementCompleted();

      this.logger.info(`Migration successful: ${file.name} → ${cid}`, {
        size: buffer.length,
        duration: migration.migration.duration
      });

      if (onFileComplete) {
        onFileComplete({
          file,
          result: migration,
          progress: this.progress.getStatus()
        });
      }

      return migration;
    } catch (error) {
      const failure = {
        googleFile: {
          id: file.id,
          name: file.name,
          size: parseInt(file.size || '0', 10),
          mimeType: file.mimeType
        },
        error: {
          message: error.message,
          code: error.code,
          timestamp: new Date().toISOString()
        },
        migration: {
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          success: false
        }
      };

      this.failures.push(failure);
      this.progress.incrementFailed();

      this.logger.error(`Migration failed: ${file.name}`, error);

      if (onFileComplete) {
        onFileComplete({
          file,
          result: failure,
          progress: this.progress.getStatus()
        });
      }

      return failure;
    }
  }

  async streamToBuffer(stream, file) {
    const chunks = [];
    let totalBytes = 0;
    const expectedSize = parseInt(file.size || '0', 10);
  
    return new Promise((resolve, reject) => {
      // 30 minutes idle timeout, reset every time data arrives
      let idleTimer = setTimeout(() => {
        reject(new Error('Download timeout'));
      }, 30 * 60 * 1000);
  
      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          reject(new Error('Download timeout'));
        }, 30 * 60 * 1000);
      };
  
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
        resetIdle();
  
        if (expectedSize > 0) {
          this.progress.updateBytes(totalBytes);
        }
      });
  
      stream.on('end', () => {
        clearTimeout(idleTimer);
        const buffer = Buffer.concat(chunks);
  
        if (expectedSize > 0 && buffer.length !== expectedSize) {
          this.logger.warn(`Size mismatch: ${file.name}`, {
            expected: expectedSize,
            actual: buffer.length
          });
        }
  
        resolve(buffer);
      });
  
      stream.on('error', (error) => {
        clearTimeout(idleTimer);
        reject(new Error(`Stream error: ${error.message}`));
      });
    });
  }
  

  generateResults() {
    const endTime = Date.now();
    const duration = endTime - this.progress.startTime;

    const successful = this.migrations.length;
    const failed = this.failures.length;
    const total = successful + failed;

    const totalBytes = this.migrations.reduce((sum, m) =>
      sum + m.googleFile.size, 0
    );

    // Make upload stats optional (depends on LighthouseClient implementation)
    const uploadStats = (typeof this.lighthouse.getUploadStats === 'function')
      ? this.lighthouse.getUploadStats()
      : { averageThroughput: 0, formattedThroughput: 'N/A' };

    return {
      summary: {
        total,
        completed: successful,
        failed,
        successRate: total > 0 ? (successful / total * 100).toFixed(1) + '%' : '0%',
        duration,
        totalBytes,
        averageFileSize: successful > 0 ? Math.round(totalBytes / successful) : 0,
        throughput: duration > 0 ? Math.round(totalBytes / (duration / 1000)) : 0,
        stopped: this.shouldStop
      },
      migrations: this.migrations,
      failures: this.failures,
      lighthouse: {
        uploadStats,
        gatewayUrls: {
          primary: 'https://gateway.lighthouse.storage/ipfs/',
          alternatives: [
            'https://ipfs.io/ipfs/',
            'https://cloudflare-ipfs.com/ipfs/',
            'https://dweb.link/ipfs/'
          ]
        }
      },
      metadata: {
        mode: 'binary-only',
        startTime: new Date(this.progress.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        version: '1.0.0'
      }
    };
  }

  async rateLimitDelay() {
    await new Promise(resolve =>
      setTimeout(resolve, MIGRATION.RATE_LIMIT_DELAY || 500)
    );
  }

  async retry(fn, { retries = 3, baseMs = 1000, label = 'retry' } = {}) {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt > retries) throw err;
        const delay = baseMs * Math.pow(2, attempt - 1);
        this.logger.warn(`${label} attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  stop() {
    this.logger.info('Migration stop requested');
    this.shouldStop = true;
  }

  getProgress() {
    return this.progress.getStatus();
  }

  // (Optional) Alternative download as buffer; not used by default
  async downloadFile(file) {
    try {
      const response = await this.drive.files.get(
        {
          fileId: file.id,
          alt: 'media',
          // These two are CRITICAL for shared drives / large/binary content
          supportsAllDrives: true,
          acknowledgeAbuse: true,
        },
        {
          responseType: 'stream',
          // Let large downloads run; don’t cut them off early
          timeout: 0,                 // no client timeout
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
  
      return response.data;
    } catch (error) {
      this.logger.error(`Download failed: ${file.name}`, error);
      throw new Error(`Download failed: ${error.message}`);
    }
  }
}
