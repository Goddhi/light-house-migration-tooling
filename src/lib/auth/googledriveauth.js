import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { GOOGLE_DRIVE, FILES, ERRORS } from '../../config/constants.js';
import { Logger } from '../utils/logger.js';

export class GoogleDriveAuth {
  constructor(credentialsPath = FILES.CREDENTIALS_FILE) {
    this.credentialsPath = credentialsPath;
    this.tokenPath = FILES.TOKEN_FILE;
    this.logger = new Logger('GoogleDriveAuth');
    this.auth = null;
  }

  async authenticate() {
    this.logger.info('Starting Google Drive authentication...');

    try {
      const existingAuth = await this.loadExistingToken();
      if (existingAuth) {
        this.auth = existingAuth;
        this.logger.info('Using existing authentication token');
        return this.createDriveClient();
      }

      const auth = await this.performFreshAuth();
      await this.saveToken(auth.credentials);
      this.auth = auth;
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      
      this.logger.info('Google Drive authentication successful');
      return this.createDriveClient();

    } catch (error) {
      this.logger.error('Authentication failed', error);
      throw new Error(`${ERRORS.AUTH_FAILED}: ${error.message}`);
    }
  }

  async loadExistingToken() {
    try {
      const tokenData = await fs.readFile(this.tokenPath, 'utf8');
      const credentials = JSON.parse(tokenData);

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials(credentials);

      await this.testTokenValidity(oauth2Client);
      return oauth2Client;
    } catch (error) {
      this.logger.debug('No valid existing token found', error.message);
      return null;
    }
  }

  async testTokenValidity(oauth2Client) {
    const drive = google.drive({ version: GOOGLE_DRIVE.API_VERSION, auth: oauth2Client });
    await drive.about.get({ fields: 'user' });
  }

  async performFreshAuth() {
    try {
      const auth = await authenticate({
        scopes: GOOGLE_DRIVE.SCOPES,
        keyfilePath: this.credentialsPath,
      });

      if (!auth || !auth.credentials) {
        throw new Error('Authentication returned invalid credentials');
      }

      return auth;
    } catch (error) {
      if (error.code === 'ENOENT' && error.path?.includes(this.credentialsPath)) {
        throw new Error(`${ERRORS.MISSING_CREDENTIALS}: ${this.credentialsPath}`);
      }
      throw error;
    }
  }

  async saveToken(credentials) {
    try {
      await fs.writeFile(
        this.tokenPath,
        JSON.stringify(credentials, null, 2),
        { mode: FILES.TOKEN_PERMISSIONS }
      );
      
      this.logger.debug('Authentication token saved securely');
    } catch (error) {
      this.logger.warn('Failed to save authentication token', error);
    }
  }

  createDriveClient() {
    if (!this.auth) {
      throw new Error('Authentication required before creating Drive client');
    }

    this.drive = google.drive({ 
      version: GOOGLE_DRIVE.API_VERSION, 
      auth: this.auth 
    });

    return this.drive;
  }

  async getUserInfo() {
    if (!this.auth) {
      throw new Error('Not authenticated');
    }
  
    // make sure we have a drive client bound to this.auth
    if (!this.drive) this.createDriveClient();
  
    try {
      const about = await this.drive.about.get({
        fields: 'user,storageQuota'
      });
  
      return {
        user: {
          emailAddress: about.data?.user?.emailAddress,
          displayName: about.data?.user?.displayName,
          // picture usually isn't provided here
        },
        storageQuota: about.data?.storageQuota
      };
    } catch (error) {
      this.logger.error('Failed to get user info', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}  