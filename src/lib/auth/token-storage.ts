/**
 * Token storage with OS keyring (preferred) and file fallback
 * Handles secure storage of OAuth tokens across platforms
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { OAuthTokens, StoredTokenData, TokenStorageType } from '../types.js';
import { OAUTH_CONFIG, getScopesArray } from '../../config/oauth.js';

let keytar: any = null;

// Try to load keytar, but don't fail if unavailable
try {
  const keytarModule = await import('keytar');
  // keytar functions are on the default export in ESM
  keytar = keytarModule.default || keytarModule;
} catch (error) {
  // Keyring not available (might not be installed or platform not supported)
  keytar = null;
}

/**
 * Get the configuration directory path
 */
function getConfigDir(): string {
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), OAUTH_CONFIG.storage.configDir);
  }
  return path.join(homeDir, OAUTH_CONFIG.storage.configDir);
}

/**
 * Get the token file path
 */
function getTokenFilePath(): string {
  return path.join(getConfigDir(), OAUTH_CONFIG.storage.tokenFileName);
}

/**
 * Store tokens in OS keyring
 */
async function storeInKeyring(email: string, data: StoredTokenData): Promise<boolean> {
  if (!keytar || typeof keytar.setPassword !== 'function') return false;

  try {
    await keytar.setPassword(
      OAUTH_CONFIG.storage.serviceName,
      email,
      JSON.stringify(data)
    );
    return true;
  } catch (error) {
    // Silently fall back to file storage
    return false;
  }
}

/**
 * Retrieve tokens from OS keyring
 */
async function retrieveFromKeyring(email: string): Promise<StoredTokenData | null> {
  if (!keytar || typeof keytar.getPassword !== 'function') return null;

  try {
    const data = await keytar.getPassword(
      OAUTH_CONFIG.storage.serviceName,
      email
    );
    if (!data) return null;
    return JSON.parse(data) as StoredTokenData;
  } catch (error) {
    // Silently fall back to file storage
    return null;
  }
}

/**
 * Delete tokens from OS keyring
 */
async function deleteFromKeyring(email: string): Promise<boolean> {
  if (!keytar || typeof keytar.deletePassword !== 'function') return false;

  try {
    return await keytar.deletePassword(
      OAUTH_CONFIG.storage.serviceName,
      email
    );
  } catch (error) {
    // Silently fall back
    return false;
  }
}

/**
 * Store tokens in file system (fallback)
 */
async function storeInFile(data: StoredTokenData): Promise<void> {
  const configDir = getConfigDir();
  const tokenPath = getTokenFilePath();

  // Ensure config directory exists
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });

  // Write token file with restricted permissions
  await fs.writeFile(
    tokenPath,
    JSON.stringify(data, null, 2),
    { mode: 0o600 }
  );
}

/**
 * Retrieve tokens from file system
 */
async function retrieveFromFile(): Promise<StoredTokenData | null> {
  try {
    const tokenPath = getTokenFilePath();
    const data = await fs.readFile(tokenPath, 'utf-8');
    return JSON.parse(data) as StoredTokenData;
  } catch (error) {
    // File doesn't exist or can't be read
    return null;
  }
}

/**
 * Delete tokens from file system
 */
async function deleteFromFile(): Promise<void> {
  try {
    const tokenPath = getTokenFilePath();
    await fs.unlink(tokenPath);
  } catch (error) {
    // File doesn't exist, ignore
  }
}

// ========== Public API ==========

/**
 * Store tokens in both keyring (if available) and file
 * Keyring provides OS-level security, file ensures tokens can always be retrieved
 */
export async function storeTokens(
  tokens: OAuthTokens,
  email?: string,
  scopes?: string[]
): Promise<TokenStorageType> {
  const data: StoredTokenData = {
    tokens,
    email,
    scopes: scopes || getScopesArray(),
    createdAt: Date.now(),
  };

  let storedInKeyring = false;

  // Try to store in keyring first if email is provided
  if (email && keytar) {
    storedInKeyring = await storeInKeyring(email, data);
  }

  // Always also store in file (as backup and for easy retrieval)
  await storeInFile(data);

  // Return primary storage type
  return storedInKeyring ? 'keyring' : 'file';
}

/**
 * Retrieve stored tokens
 * @param email - Optional email to look up in keyring
 */
export async function retrieveTokens(email?: string): Promise<StoredTokenData | null> {
  // Try keyring first if email provided
  if (email && keytar) {
    const data = await retrieveFromKeyring(email);
    if (data) return data;
  }

  // Fallback to file storage
  return await retrieveFromFile();
}

/**
 * Delete stored tokens from all locations
 */
export async function deleteTokens(email?: string): Promise<void> {
  // Delete from keyring if email provided
  if (email && keytar) {
    await deleteFromKeyring(email);
  }

  // Delete from file
  await deleteFromFile();
}

/**
 * Update tokens (refresh, etc.) while preserving metadata
 */
export async function updateTokens(
  tokens: Partial<OAuthTokens>
): Promise<void> {
  const existingData = await retrieveTokens();
  if (!existingData) {
    throw new Error('No existing tokens found to update');
  }

  const updatedData: StoredTokenData = {
    ...existingData,
    tokens: {
      ...existingData.tokens,
      ...tokens,
    },
    lastRefreshedAt: Date.now(),
  };

  // Store in keyring if available
  if (existingData.email && keytar) {
    await storeInKeyring(existingData.email, updatedData);
  }

  // Always also store in file (for reliable retrieval)
  await storeInFile(updatedData);
}

/**
 * Check if tokens are stored
 */
export async function hasStoredTokens(email?: string): Promise<boolean> {
  const data = await retrieveTokens(email);
  return data !== null;
}

/**
 * Get storage type being used
 */
export async function getStorageType(email?: string): Promise<TokenStorageType | null> {
  if (email && keytar) {
    const data = await retrieveFromKeyring(email);
    if (data) return 'keyring';
  }

  const data = await retrieveFromFile();
  if (data) return 'file';

  return null;
}
