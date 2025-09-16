#!/usr/bin/env node
import { Command } from "commander";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import fs from "fs/promises";
import path from "path";

import { listAllFiles, isWorkspace, downloadBuffer, getAboutEmail } from "../lib/drive.js";
import { ensureKeyValid, uploadBuffer } from "../lib/lighthouse.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function fmtBytes(n: number) {
  const u = ["B", "KB", "MB", "GB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

async function getDrive() {
  const CREDENTIALS = path.resolve(process.cwd(), "credentials.json");
  const TOKEN = path.resolve(process.cwd(), "token.json");
  const auth = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS });
  try { await fs.access(TOKEN); } catch {
    await fs.writeFile(TOKEN, JSON.stringify((auth as any).credentials ?? {}), { mode: 0o600 });
  }
  return google.drive({ version: "v3", auth });
}

async function migrateDrive(folderId: string | undefined, analyzeOnly: boolean, maxMB: number) {
  const key = process.env.LIGHTHOUSE_API_KEY;
  if (!analyzeOnly && !key) throw new Error("LIGHTHOUSE_API_KEY is required");

  const drive = await getDrive();
  const email = await getAboutEmail(drive);
  console.log(`✔ Google Drive: ${email}`);

  const all = await listAllFiles(drive, folderId);
  const binaries = all.filter((f) => !isWorkspace(f.mimeType));
  const maxBytes = maxMB * 1024 * 1024;
  const oversized = binaries.filter((f) => (parseInt(f.size || "0", 10) > maxBytes));
  const eligible = binaries.filter((f) => !oversized.includes(f));

  console.log(`\nFound ${all.length} total, ${binaries.length} binary, ${eligible.length} eligible (${oversized.length} too large).`);
  const totalBytes = eligible.reduce((a, f) => a + (parseInt(f.size || "0", 10) || 0), 0);
  console.log(`Planned data: ${fmtBytes(totalBytes)}`);

  if (analyzeOnly) {
    const dist = { "<1MB": 0, "1–10MB": 0, "10–50MB": 0, "≥50MB": 0 };
    for (const f of binaries) {
      const sz = parseInt(f.size || "0", 10);
      if (sz < 1 << 20) dist["<1MB"]++;
      else if (sz < 10 << 20) dist["1–10MB"]++;
      else if (sz < 50 << 20) dist["10–50MB"]++;
      else dist["≥50MB"]++;
    }
    console.log("\nSize distribution (binary files):");
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

// ---------- Commander wiring ----------
const program = new Command();
program.name("lh").description("Lighthouse Drive migration CLI").version("0.1.0");

program
  .command("migrate")
  .description("Migration commands")
  .command("drive")
  .argument("[folderId]", "Google Drive folder ID (default: root)")
  .option("--analyze", "Analyze only; do not upload", false)
  .option("--max <MB>", "Max file size in MB (default: 50)", (v) => parseInt(v, 10), 50)
  .action(async (folderId: string | undefined, opts: { analyze: boolean; max: number }) => {
    try {
      await migrateDrive(folderId, opts.analyze, opts.max);
    } catch (err: any) {
      console.error("Error:", err.message || err);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
