import fs from 'fs/promises';
import path from 'path';

export class Logger {
  constructor(component) {
    this.component = component;
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const formattedMeta = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${this.component}: ${message}${formattedMeta}`;
  }

  async writeToFile(logMessage) {
    try {
      await fs.appendFile('migration.log', logMessage + '\n');
    } catch (error) {
      // Fail silently to avoid recursive logging issues
    }
  }

  error(message, error = null, meta = {}) {
    if (!this.shouldLog('error')) return;
    
    const errorMeta = error ? { 
      ...meta, 
      error: error.message, 
      stack: error.stack?.split('\n').slice(0, 3).join(' → ') 
    } : meta;
    
    const logMessage = this.formatMessage('error', message, errorMeta);
    console.error(logMessage);
    this.writeToFile(logMessage);
  }

  warn(message, meta = {}) {
    if (!this.shouldLog('warn')) return;
    
    const logMessage = this.formatMessage('warn', message, meta);
    console.warn(logMessage);
    this.writeToFile(logMessage);
  }

  info(message, meta = {}) {
    if (!this.shouldLog('info')) return;
    
    const logMessage = this.formatMessage('info', message, meta);
    console.log(logMessage);
    this.writeToFile(logMessage);
  }

  debug(message, meta = {}) {
    if (!this.shouldLog('debug')) return;
    
    const logMessage = this.formatMessage('debug', message, meta);
    console.log(logMessage);
    this.writeToFile(logMessage);
  }
}
