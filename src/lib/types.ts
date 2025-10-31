export type UserID = string;

export type DriveScanResult = {
  total: number;
  binary: number;
  eligible: number;
  oversized: number;
  plannedBytes: number;
  sizeBuckets: Record<string, number>;
};

export type MigrationItem = {
  fileId: string;
  name: string;
  cid?: string;
  error?: string;
  bytes?: number;
};

export type MigrationStatus = {
  id: string;
  userId: string;
  startedAt: number;
  finishedAt?: number;
  ok: number;
  fail: number;
  skipped: number;
  items: MigrationItem[];
};

// ========== Auth Types ==========

/**
 * OAuth 2.0 tokens returned from Google
 */
export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date?: number; // Unix timestamp in milliseconds
  id_token?: string;
};

/**
 * Stored token metadata
 */
export type StoredTokenData = {
  tokens: OAuthTokens;
  email?: string;
  scopes: string[];
  createdAt: number;
  lastRefreshedAt?: number;
};

/**
 * Token storage backend type
 */
export type TokenStorageType = 'keyring' | 'file';

/**
 * Auth flow method
 */
export type AuthFlowMethod = 'localhost' | 'device';

/**
 * Device flow response from Google
 */
export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

/**
 * Auth status information
 */
export type AuthStatus = {
  authenticated: boolean;
  email?: string;
  scopes?: string[];
  expiresAt?: Date;
  storageType?: TokenStorageType;
  lastRefreshed?: Date;
};
