/**
 * CLI command: lh list files
 * List files in Google Drive with their names and IDs
 */

import { getDriveClient, isAuthenticated } from '../../lib/auth/oauth.js';
import { isWorkspace } from '../../lib/drive.js';

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  mimeType?: string;
}

/**
 * Format file size
 */
function fmtBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * List files from a folder
 */
async function listFilesInFolder(
  drive: any,
  folderId: string = 'root',
  search?: string
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  let query = `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;

  if (search) {
    query += ` and name contains '${search}'`;
  }

  do {
    const { data } = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, size, mimeType)',
      pageSize: 100,
      pageToken,
    });

    for (const file of data.files || []) {
      files.push({
        id: file.id!,
        name: file.name!,
        size: file.size,
        mimeType: file.mimeType,
      });
    }

    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

export async function listFiles(options: {
  folder?: string;
  search?: string;
  extension?: string;
  limit?: number;
}) {
  try {
    // Check authentication
    if (!await isAuthenticated()) {
      console.error('\n✗ Not authenticated. Please run "lh auth init" first\n');
      process.exit(1);
    }

    const folderId = options.folder || 'root';
    const folderName = folderId === 'root' ? 'My Drive' : `Folder ${folderId}`;

    console.log(`\n📄 Fetching files from ${folderName}...\n`);

    const drive = await getDriveClient();
    let files = await listFilesInFolder(drive, folderId, options.search);

    if (files.length === 0) {
      console.log('No files found\n');
      return;
    }

    // Filter by extension if provided
    if (options.extension) {
      const ext = options.extension.toLowerCase();
      files = files.filter(f => {
        const fileExt = f.name.split('.').pop()?.toLowerCase();
        return fileExt === ext;
      });

      if (files.length === 0) {
        console.log(`No files found with extension "${options.extension}"\n`);
        return;
      }
    }

    // Filter out Google Workspace files
    const regularFiles = files.filter(f => !isWorkspace(f.mimeType));
    const workspaceFiles = files.length - regularFiles.length;

    // Apply limit if specified
    const displayFiles = options.limit
      ? regularFiles.slice(0, options.limit)
      : regularFiles;

    console.log(`Found ${regularFiles.length} file(s)${workspaceFiles > 0 ? ` (${workspaceFiles} Google Workspace files excluded)` : ''}\n`);

    if (options.limit && regularFiles.length > options.limit) {
      console.log(`Showing first ${options.limit} files\n`);
    }

    // Display files in a simple list format (easier to copy IDs)
    displayFiles.forEach((file, index) => {
      const size = file.size
        ? fmtBytes(parseInt(file.size, 10))
        : 'N/A';

      console.log(`${index + 1}. 📄 ${file.name}`);
      console.log(`   Size: ${size}`);
      console.log(`   ID:   ${file.id}`);
      console.log();
    });

    console.log('💡 Tip: Use file ID with --files option:');
    console.log('   lh migrate drive --files <file-id-1>,<file-id-2> --analyze\n');

    if (options.limit && regularFiles.length > options.limit) {
      console.log(`💡 To see all files, run without --limit or increase the limit\n`);
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n✗ Error listing files: ${error.message}\n`);
    } else {
      console.error('\n✗ Unknown error occurred\n');
    }
    process.exit(1);
  }
}
