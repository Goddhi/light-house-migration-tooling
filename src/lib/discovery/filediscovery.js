import { GOOGLE_DRIVE } from '../../config/constants.js';
import { Logger } from '../utils/logger.js';
import { FileUtils } from '../utils/fileutils.js';

export class FileDiscovery {
  constructor(driveClient) {
    this.drive = driveClient;
    this.logger = new Logger('FileDiscovery');
    this.pathCache = new Map();
  }

  async discoverFiles(options = {}) {
    const { folderId, includeSharedDrives = true, onProgress } = options;
    
    this.logger.info('Starting file discovery', { folderId, includeSharedDrives });

    try {
      const allFiles = await this.fetchAllFiles(folderId, includeSharedDrives, onProgress);
      const categorizedFiles = this.categorizeFiles(allFiles);
      
      this.logger.info('File discovery completed', {
        total: allFiles.length,
        binary: categorizedFiles.binaryFiles.length,
        workspace: categorizedFiles.workspaceFiles.length
      });

      return {
        allFiles,
        binaryFiles: categorizedFiles.binaryFiles,
        workspaceFiles: categorizedFiles.workspaceFiles,
        statistics: this.generateStatistics(categorizedFiles)
      };
    } catch (error) {
      this.logger.error('File discovery failed', error);
      throw error;
    }
  }

  async fetchAllFiles(folderId, includeSharedDrives, onProgress) {
    const allFiles = [];
    let pageToken = null;
    let totalProcessed = 0;

    do {
      const query = this.buildQuery(folderId);
      
      const requestParams = {
        q: query,
        fields: 'nextPageToken, files(id,name,mimeType,size,parents,modifiedTime,createdTime,owners,sharingUser)',
        pageSize: GOOGLE_DRIVE.MAX_PAGE_SIZE,
        pageToken,
        orderBy: 'modifiedTime desc'
      };

      if (includeSharedDrives) {
        requestParams.supportsAllDrives = true;
        requestParams.includeItemsFromAllDrives = true;
      }

      try {
        const response = await this.drive.files.list(requestParams);
        const batch = response.data.files || [];

        const files = batch.filter(file => !this.isFolder(file));
        allFiles.push(...files);
        
        totalProcessed += batch.length;
        pageToken = response.data.nextPageToken;

        if (onProgress) {
          onProgress({
            type: 'discovery',
            filesFound: allFiles.length,
            totalProcessed,
            hasMore: !!pageToken
          });
        }

        if (pageToken) {
          await this.rateLimitDelay();
        }

      } catch (error) {
        if (this.isRateLimitError(error)) {
          await this.handleRateLimit(error);
          continue;
        }
        throw error;
      }

    } while (pageToken);

    return allFiles;
  }

  buildQuery(folderId) {
    const baseQuery = "trashed = false";
    
    if (folderId) {
      return `'${folderId}' in parents and ${baseQuery}`;
    }
    
    return baseQuery;
  }

  isFolder(file) {
    return file.mimeType === 'application/vnd.google-apps.folder';
  }

  categorizeFiles(files) {
    const binaryFiles = [];
    const workspaceFiles = [];

    for (const file of files) {
      if (this.isGoogleWorkspaceFile(file.mimeType)) {
        workspaceFiles.push({
          ...file,
          workspaceType: FileUtils.getWorkspaceTypeName(file.mimeType)
        });
      } else {
        binaryFiles.push(file);
      }
    }

    return { binaryFiles, workspaceFiles };
  }

  isGoogleWorkspaceFile(mimeType) {
    return GOOGLE_DRIVE.WORKSPACE_MIME_TYPES.includes(mimeType);
  }

  generateStatistics(categorizedFiles) {
    const { binaryFiles, workspaceFiles } = categorizedFiles;

    const binaryStats = this.calculateFileStats(binaryFiles);
    
    const workspaceTypeCount = {};
    for (const file of workspaceFiles) {
      const type = file.workspaceType;
      workspaceTypeCount[type] = (workspaceTypeCount[type] || 0) + 1;
    }

    const sizeDistribution = this.calculateSizeDistribution(binaryFiles);

    return {
      binary: {
        count: binaryFiles.length,
        totalSize: binaryStats.totalSize,
        averageSize: binaryStats.averageSize,
        sizeDistribution
      },
      workspace: {
        count: workspaceFiles.length,
        typeBreakdown: workspaceTypeCount
      },
      overall: {
        totalFiles: binaryFiles.length + workspaceFiles.length,
        migratableFiles: binaryFiles.length,
        skippedFiles: workspaceFiles.length,
        migrationRatio: binaryFiles.length / (binaryFiles.length + workspaceFiles.length)
      }
    };
  }

  calculateFileStats(files) {
    const sizes = files
      .map(file => parseInt(file.size || '0', 10))
      .filter(size => size > 0);

    const totalSize = sizes.reduce((sum, size) => sum + size, 0);
    const averageSize = sizes.length > 0 ? totalSize / sizes.length : 0;

    return { totalSize, averageSize };
  }

  calculateSizeDistribution(files) {
    const distribution = {
      small: 0,
      medium: 0,
      large: 0,
      xlarge: 0
    };

    for (const file of files) {
      const size = parseInt(file.size || '0', 10);
      
      if (size < 1024 * 1024) {
        distribution.small++;
      } else if (size < 10 * 1024 * 1024) {
        distribution.medium++;
      } else if (size < 100 * 1024 * 1024) {
        distribution.large++;
      } else {
        distribution.xlarge++;
      }
    }

    return distribution;
  }

  async rateLimitDelay() {
    await new Promise(resolve => 
      setTimeout(resolve, GOOGLE_DRIVE.RATE_LIMIT_DELAY)
    );
  }

  isRateLimitError(error) {
    return error.code === 429 || 
           (error.code === 403 && error.message?.includes('rate'));
  }

  async handleRateLimit(error) {
    const retryAfter = error.response?.headers['retry-after'];
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : GOOGLE_DRIVE.RETRY_BASE_DELAY;
    
    this.logger.warn(`Rate limited, waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}