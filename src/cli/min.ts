#!/usr/bin/env node
import 'dotenv/config';
import { Command } from "commander";

import { listAllFiles, isWorkspace, downloadBuffer, getAboutEmail } from "../lib/drive.js";
import { ensureKeyValid, uploadBuffer } from "../lib/lighthouse.js";
import { getDriveClient, isAuthenticated } from "../lib/auth/oauth.js";
import { authInit } from "./commands/auth-init.js";
import { authStatus } from "./commands/auth-status.js";
import { authLogout } from "./commands/auth-logout.js";
import { listFolders } from "./commands/list-folders.js";
import { listFiles } from "./commands/list-files.js";

function fmtBytes(n: number) {
  const u = ["B", "KB", "MB", "GB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

interface MigrateOptions {
  analyze: boolean;
  max: number;
  folders?: string;
  files?: string;
  include?: string;
  exclude?: string;
  excludeFolders?: string;
}

async function migrateDrive(folderId: string | undefined, options: MigrateOptions) {
  // Check authentication first
  if (!await isAuthenticated()) {
    console.error('\n✗ Not authenticated. Please run "lh auth init" first\n');
    process.exit(1);
  }

  const key = process.env.LIGHTHOUSE_API_KEY;
  if (!options.analyze && !key) throw new Error("LIGHTHOUSE_API_KEY is required");

  // Get authenticated Drive client (with auto-refresh)
  const drive = await getDriveClient();
  const email = await getAboutEmail(drive);
  console.log(`✔ Google Drive: ${email}`);

  // Parse file IDs if provided (takes precedence over folders)
  const fileIds = options.files ? options.files.split(',').map(id => id.trim()) : [];

  // Parse folder options
  const folderIds = options.folders ? options.folders.split(',').map(id => id.trim()) : [folderId || 'root'];
  const excludeFolderIds = options.excludeFolders ? options.excludeFolders.split(',').map(id => id.trim()) : [];

  // Parse file extension filters
  const includeExts = options.include ? options.include.split(',').map(ext => ext.trim().toLowerCase()) : [];
  const excludeExts = options.exclude ? options.exclude.split(',').map(ext => ext.trim().toLowerCase()) : [];

  let all = [];

  // If specific file IDs are provided, fetch only those files
  if (fileIds.length > 0) {
    console.log(`📄 Fetching ${fileIds.length} specific file(s)...\n`);
    for (const fileId of fileIds) {
      try {
        const { data } = await drive.files.get({
          fileId,
          fields: 'id,name,mimeType,size',
        });
        all.push(data);
      } catch (error) {
        console.warn(`⚠️  Could not fetch file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  } else {
    // List files from all specified folders
    for (const id of folderIds) {
      const files = await listAllFiles(drive, id);
      all.push(...files);
    }
  }

  // Filter out workspace files
  let binaries = all.filter((f) => !isWorkspace(f.mimeType));

  // Apply file extension filters
  if (includeExts.length > 0) {
    binaries = binaries.filter(f => {
      const ext = (f.name || '').split('.').pop()?.toLowerCase();
      return ext && includeExts.includes(ext);
    });
  }

  if (excludeExts.length > 0) {
    binaries = binaries.filter(f => {
      const ext = (f.name || '').split('.').pop()?.toLowerCase();
      return !ext || !excludeExts.includes(ext);
    });
  }

  // Apply size filter
  const maxBytes = options.max * 1024 * 1024;
  const oversized = binaries.filter((f) => (parseInt(f.size || "0", 10) > maxBytes));
  const eligible = binaries.filter((f) => !oversized.includes(f));

  // Show filter summary
  console.log();
  if (fileIds.length > 0) {
    console.log(`📄 Files: ${fileIds.length} specific file(s) selected`);
  } else if (folderIds.length > 1 || folderIds[0] !== 'root') {
    console.log(`📁 Folders: ${folderIds.join(', ')}`);
  }
  if (includeExts.length > 0) {
    console.log(`✓ Including: ${includeExts.join(', ')}`);
  }
  if (excludeExts.length > 0) {
    console.log(`✗ Excluding: ${excludeExts.join(', ')}`);
  }

  console.log(`\nFound ${all.length} total, ${binaries.length} after filters, ${eligible.length} eligible (${oversized.length} too large).`);
  const totalBytes = eligible.reduce((a, f) => a + (parseInt(f.size || "0", 10) || 0), 0);
  console.log(`Planned data: ${fmtBytes(totalBytes)}`);

  if (options.analyze) {
    const dist = { "<1MB": 0, "1–10MB": 0, "10–50MB": 0, "≥50MB": 0 };
    for (const f of binaries) {
      const sz = parseInt(f.size || "0", 10);
      if (sz < 1 << 20) dist["<1MB"]++;
      else if (sz < 10 << 20) dist["1–10MB"]++;
      else if (sz < 50 << 20) dist["10–50MB"]++;
      else dist["≥50MB"]++;
    }
    console.log("\nSize distribution (filtered files):");
    for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${v}`);
    return;
  }

  await ensureKeyValid(key!);

  let ok = 0, fail = 0, skipped = oversized.length;
  const start = Date.now();

  for (const f of eligible) {
    try {
      const buf = await downloadBuffer(drive, f.id!);
      const { cid, size } = await uploadBuffer(buf, key!);
      ok++;
      console.log(`✓ ${f.name} → ${cid} (${fmtBytes(size)})`);
    } catch (e: any) {
      fail++;
      console.log(`✗ ${f.name}: ${e.message}`);
    }
  }

  const dur = (Date.now() - start) / 1000;
  const throughput = dur ? `${fmtBytes(totalBytes / dur)}/s` : "—";
  console.log(`\nDone. ok=${ok} fail=${fail} skipped=${skipped} in ${dur.toFixed(1)}s (${throughput})`);
}

// Commander wiring
const program = new Command();
program
  .name("lh")
  .description("Lighthouse Drive migration CLI")
  .version("0.1.0");

// Auth commands
const authCommand = program
  .command("auth")
  .description("Authentication commands");

authCommand
  .command("init")
  .description("Initialize authentication with Google Drive")
  .option("--device", "Use device flow (for headless/remote machines)")
  .option("--force", "Force re-authentication even if already authenticated")
  .action(async (opts) => {
    await authInit(opts);
  });

authCommand
  .command("status")
  .description("Show authentication status")
  .action(async () => {
    await authStatus();
  });

authCommand
  .command("logout")
  .description("Logout and delete stored tokens")
  .option("--no-revoke", "Don't revoke token with Google (just delete locally)")
  .option("--force", "Skip confirmation prompt")
  .action(async (opts) => {
    await authLogout(opts);
  });

// List commands
const listCommand = program
  .command("list")
  .description("List and browse Google Drive content");

listCommand
  .command("folders")
  .description("List all folders in Google Drive")
  .option("--flat", "Show flat list instead of tree view")
  .option("--search <name>", "Search for folders by name")
  .action(async (opts) => {
    await listFolders(opts);
  });

listCommand
  .command("files")
  .description("List files in Google Drive")
  .option("--folder <id>", "Folder ID to list files from (default: root)")
  .option("--search <name>", "Search for files by name")
  .option("--extension <ext>", "Filter by file extension (e.g., pdf, jpg)")
  .option("--limit <number>", "Limit number of results", (v) => parseInt(v, 10))
  .action(async (opts) => {
    await listFiles(opts);
  });

// Migration commands
const migrateCommand = program
  .command("migrate")
  .description("Migration commands");

migrateCommand
  .command("drive")
  .argument("[folderId]", "Google Drive folder ID (default: root)")
  .option("--analyze", "Analyze only; do not upload", false)
  .option("--max <MB>", "Max file size in MB (default: 50)", (v) => parseInt(v, 10), 50)
  .option("--folders <ids>", "Comma-separated list of specific folder IDs to migrate")
  .option("--files <ids>", "Comma-separated list of specific file IDs to migrate")
  .option("--include <extensions>", "Only include these file extensions (e.g., pdf,jpg,png)")
  .option("--exclude <extensions>", "Exclude these file extensions (e.g., tmp,log)")
  .option("--exclude-folders <ids>", "Comma-separated list of folder IDs to exclude")
  .action(async (folderId: string | undefined, opts: any) => {
    try {
      await migrateDrive(folderId, opts);
    } catch (err: any) {
      console.error("Error:", err.message || err);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
