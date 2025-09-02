import { GOOGLE_DRIVE } from '../../config/constants.js';

export class FileUtils {
  static formatBytes(bytes, decimals = 2) {
    if (!bytes) return '0 B';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  static formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static getWorkspaceTypeName(mimeType) {
    return GOOGLE_DRIVE.WORKSPACE_TYPE_NAMES[mimeType] || 'Unknown Google Workspace file';
  }

  static isValidFileName(filename) {
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    return !invalidChars.test(filename) && filename.length <= 255;
  }

  static sanitizeFileName(filename) {
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .substring(0, 255);
  }

  static getFileExtension(filename) {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  static joinPath(...parts) {
    return parts
      .map(part => part.toString().replace(/^\/+|\/+$/g, ''))
      .filter(part => part.length > 0)
      .join('/');
  }

  static getMimeTypeCategory(mimeType) {
    if (!mimeType) return 'unknown';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
    if (mimeType.includes('text/')) return 'text';
    
    return 'other';
  }
}
