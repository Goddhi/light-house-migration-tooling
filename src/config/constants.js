export const GOOGLE_DRIVE = {
    SCOPES: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      // add these so we can fetch the signed-in user's email/profile
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid',
      ],
    API_VERSION: 'v3',
    MAX_PAGE_SIZE: 1000,
    RATE_LIMIT_DELAY: 500,
    MAX_RETRIES: 3,
    RETRY_BASE_DELAY: 1000,
    
    WORKSPACE_MIME_TYPES: [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
      'application/vnd.google-apps.drawing',
      'application/vnd.google-apps.form',
      'application/vnd.google-apps.script',
      'application/vnd.google-apps.map',
      'application/vnd.google-apps.site',
      'application/vnd.google-apps.shortcut',
      'application/vnd.google-apps.folder'
    ],
    
    WORKSPACE_TYPE_NAMES: {
      'application/vnd.google-apps.document': 'Google Doc',
      'application/vnd.google-apps.spreadsheet': 'Google Sheet',
      'application/vnd.google-apps.presentation': 'Google Slide',
      'application/vnd.google-apps.drawing': 'Google Drawing',
      'application/vnd.google-apps.form': 'Google Form',
      'application/vnd.google-apps.script': 'Google Apps Script',
      'application/vnd.google-apps.map': 'Google My Maps',
      'application/vnd.google-apps.site': 'Google Sites',
      'application/vnd.google-apps.shortcut': 'Shortcut',
      'application/vnd.google-apps.folder': 'Folder'
    }
  };
  
  export const LIGHTHOUSE = {
    DEFAULT_ENDPOINT: 'https://node.lighthouse.storage',
    UPLOAD_TIMEOUT: 300000,
    MAX_SINGLE_FILE_SIZE: 100 * 1024 * 1024,
    DEAL_CHECK_TIMEOUT: 30000,
  };
  
  export const MIGRATION = {
    DEFAULT_BATCH_SIZE: 3,
    MAX_BATCH_SIZE: 10,
    MIN_BATCH_SIZE: 1,
    PROGRESS_UPDATE_INTERVAL: 1000,
    TEMP_DIR_PREFIX: 'lighthouse-migration-',
    
    SIZE_CATEGORIES: {
      SMALL: 1024 * 1024,
      MEDIUM: 10 * 1024 * 1024,
      LARGE: 100 * 1024 * 1024,
      XLARGE: Infinity
    }
  };
  
  export const CLI = {
    APP_NAME: 'lighthouse-migrate',
    VERSION: '1.0.0',
    DESCRIPTION: 'Migrate binary files from Google Drive to Lighthouse decentralized storage',
    
    COLORS: {
      SUCCESS: 'green',
      ERROR: 'red',
      WARNING: 'yellow',
      INFO: 'blue',
      HIGHLIGHT: 'cyan'
    },
    
    SYMBOLS: {
      SUCCESS: '✓',
      ERROR: '✗',
      WARNING: '⚠',
      INFO: 'ℹ',
      ARROW: '→',
      BULLET: '•'
    }
  };
  
  export const FILES = {
    TOKEN_FILE: 'token.json',
    CREDENTIALS_FILE: 'credentials.json',
    REPORT_FILE: 'migration-report.json',
    LOG_FILE: 'migration.log',
    TOKEN_PERMISSIONS: 0o600
  };
  
  export const ERRORS = {
    MISSING_API_KEY: 'LIGHTHOUSE_API_KEY environment variable is required',
    MISSING_CREDENTIALS: 'Google Drive credentials file not found',
    AUTH_FAILED: 'Google Drive authentication failed',
    INVALID_FOLDER_ID: 'Invalid Google Drive folder ID',
    UPLOAD_FAILED: 'Failed to upload file to Lighthouse',
    NETWORK_ERROR: 'Network connection error',
    RATE_LIMITED: 'API rate limit exceeded',
    INSUFFICIENT_QUOTA: 'Insufficient Lighthouse storage quota'
  };