import { Logger } from '../utils/logger.js';

export class ProgressTracker {
  constructor() {
    this.logger = new Logger('ProgressTracker');
    this.reset();
  }

  start(total) {
    this.total = total;
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    
    this.logger.info(`Progress tracking started for ${total} files`);
  }

  updateCurrent(filename) {
    this.currentFile = filename;
    this.lastUpdateTime = Date.now();
  }

  incrementCompleted() {
    this.completed++;
    this.lastUpdateTime = Date.now();
  }

  incrementFailed() {
    this.failed++;
    this.lastUpdateTime = Date.now();
  }

  updateBytes(bytes) {
    this.bytesTransferred = bytes;
    this.lastUpdateTime = Date.now();
  }

  complete() {
    this.endTime = Date.now();
    this.isComplete = true;
    this.currentFile = null;
    
    this.logger.info('Progress tracking completed', {
      completed: this.completed,
      failed: this.failed,
      duration: this.getDuration()
    });
  }

  reset() {
    this.total = 0;
    this.completed = 0;
    this.failed = 0;
    this.bytesTransferred = 0;
    this.currentFile = null;
    this.startTime = null;
    this.endTime = null;
    this.lastUpdateTime = null;
    this.isComplete = false;
  }

  getStatus() {
    const now = Date.now();
    const duration = this.getDuration();
    const processed = this.completed + this.failed;
    
    return {
      total: this.total,
      completed: this.completed,
      failed: this.failed,
      processed,
      remaining: this.total - processed,
      percentage: this.total > 0 ? Math.round((processed / this.total) * 100) : 0,
      successRate: processed > 0 ? Math.round((this.completed / processed) * 100) : 0,
      currentFile: this.currentFile,
      bytesTransferred: this.bytesTransferred,
      duration,
      estimatedTimeRemaining: this.getEstimatedTimeRemaining(),
      rate: this.getProcessingRate(),
      isComplete: this.isComplete,
      lastUpdate: this.lastUpdateTime ? new Date(this.lastUpdateTime).toISOString() : null
    };
  }

  getProcessingRate() {
    const duration = this.getDuration();
    const processed = this.completed + this.failed;
    
    if (duration === 0 || processed === 0) {
      return 0;
    }
    
    return Math.round((processed / (duration / 60000)) * 10) / 10;
  }

  getEstimatedTimeRemaining() {
    const rate = this.getProcessingRate();
    const remaining = this.total - (this.completed + this.failed);
    
    if (rate === 0 || remaining === 0 || this.isComplete) {
      return null;
    }
    
    return Math.round((remaining / rate) * 60000);
  }

  getDuration() {
    if (!this.startTime) {
      return 0;
    }
    
    const endTime = this.endTime || Date.now();
    return endTime - this.startTime;
  }
}