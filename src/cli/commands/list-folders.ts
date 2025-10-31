/**
 * CLI command: lh list folders
 * List all folders in Google Drive with their names and IDs
 */

import { getDriveClient, isAuthenticated } from '../../lib/auth/oauth.js';
import { google } from 'googleapis';

interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
}

/**
 * List all folders recursively
 */
async function listAllFolders(drive: any, parentId?: string): Promise<DriveFolder[]> {
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;

  const query = parentId
    ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and trashed=false`;

  do {
    const { data } = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, parents)',
      pageSize: 100,
      pageToken,
    });

    for (const folder of data.files || []) {
      folders.push({
        id: folder.id!,
        name: folder.name!,
        parents: folder.parents,
      });
    }

    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return folders;
}

/**
 * Build folder tree structure
 */
function buildFolderTree(folders: DriveFolder[]): Map<string, DriveFolder[]> {
  const tree = new Map<string, DriveFolder[]>();

  for (const folder of folders) {
    const parentId = folder.parents?.[0] || 'root';
    if (!tree.has(parentId)) {
      tree.set(parentId, []);
    }
    tree.get(parentId)!.push(folder);
  }

  return tree;
}

/**
 * Print folder tree
 */
function printFolderTree(
  tree: Map<string, DriveFolder[]>,
  parentId: string,
  indent: string = '',
  isLast: boolean = true
) {
  const children = tree.get(parentId) || [];

  children.forEach((folder, index) => {
    const isLastChild = index === children.length - 1;
    const marker = isLastChild ? '└──' : '├──';
    const childIndent = indent + (isLastChild ? '    ' : '│   ');

    console.log(`${indent}${marker} 📁 ${folder.name}`);
    console.log(`${indent}${isLastChild ? '    ' : '│   '}   ID: ${folder.id}`);

    // Recursively print children
    printFolderTree(tree, folder.id, childIndent, isLastChild);
  });
}

export async function listFolders(options: { flat?: boolean; search?: string }) {
  try {
    // Check authentication
    if (!await isAuthenticated()) {
      console.error('\n✗ Not authenticated. Please run "lh auth init" first\n');
      process.exit(1);
    }

    console.log('\n📂 Fetching folders from Google Drive...\n');

    const drive = await getDriveClient();
    const folders = await listAllFolders(drive);

    if (folders.length === 0) {
      console.log('No folders found in your Google Drive\n');
      return;
    }

    // Filter by search if provided
    let displayFolders = folders;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      displayFolders = folders.filter(f =>
        f.name.toLowerCase().includes(searchLower)
      );

      if (displayFolders.length === 0) {
        console.log(`No folders found matching "${options.search}"\n`);
        return;
      }

      console.log(`Found ${displayFolders.length} folder(s) matching "${options.search}":\n`);
    } else {
      console.log(`Found ${folders.length} folders total\n`);
    }

    if (options.flat || options.search) {
      // Flat list view
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║  Folder Name                          │  Folder ID        ║');
      console.log('╠════════════════════════════════════════════════════════════╣');

      displayFolders
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(folder => {
          const name = folder.name.length > 35
            ? folder.name.substring(0, 32) + '...'
            : folder.name.padEnd(35);
          console.log(`║  📁 ${name}  │  ${folder.id}  ║`);
        });

      console.log('╚════════════════════════════════════════════════════════════╝\n');
    } else {
      // Tree view
      console.log('Folder Structure:');
      console.log('─────────────────\n');

      const tree = buildFolderTree(folders);

      // Find root-level folders
      const rootFolders = tree.get('root') || [];

      if (rootFolders.length === 0) {
        console.log('No folders at root level\n');
      } else {
        console.log('📁 My Drive (root)');
        printFolderTree(tree, 'root', '');
      }

      console.log();
    }

    console.log('💡 Tip: Use folder ID with --folders option:');
    console.log('   lh migrate drive --folders <folder-id> --analyze\n');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n✗ Error listing folders: ${error.message}\n`);
    } else {
      console.error('\n✗ Unknown error occurred\n');
    }
    process.exit(1);
  }
}
