// Main library exports
export { GoogleDriveAuth } from './lib/auth/googledriveauth.js';
export { FileDiscovery } from './lib/discovery/filediscovery.js';
export { BinaryFileMigrator } from './lib/migration/binaryfilemigrator.js';
export { ProgressTracker } from './lib/migration/progresstrack.js';
export { LighthouseClient } from './lib/lighthouse/lighthouseclient.js';
export { Logger } from './lib/utils/logger.js';
export { FileUtils } from './lib/utils/fileutils.js';
export * from './config/constants.js';

export default {
  GoogleDriveAuth,
  FileDiscovery,
  BinaryFileMigrator,
  ProgressTracker,
  LighthouseClient,
  Logger,
  FileUtils,
};
