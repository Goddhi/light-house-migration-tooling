#!/usr/bin/env node
import { Command } from "commander";
import { S3Client, ListObjectsV2Command, GetObjectCommand, _Object } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import { Readable } from "stream";
import pLimit from "p-limit";

import { ensureKeyValid, uploadBuffer } from "../lib/lighthouse.js";

function fmtBytes(n: number) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

async function streamToBuffer(s: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    s.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    s.on("end", () => resolve(Buffer.concat(chunks)));
    s.on("error", reject);
  });
}

function getS3Client(region: string, profile?: string) {
  const creds = profile ? fromIni({ profile }) : undefined;
  return new S3Client({ region, credentials: creds });
}

async function listAllObjects(s3: S3Client, bucket: string, prefix?: string) {
  const items: _Object[] = [];
  let ContinuationToken: string | undefined;

  do {
    const { Contents, NextContinuationToken } = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken, MaxKeys: 1000 })
    );
    if (Contents?.length) items.push(...Contents.filter(o => !!o.Key && (o.Size ?? 0) > 0));
    ContinuationToken = NextContinuationToken;
  } while (ContinuationToken);

  return items as Required<_Object>[];
}

async function downloadToBuffer(s3: S3Client, bucket: string, key: string) {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return streamToBuffer(out.Body as Readable);
}

// Core Migration
async function migrateS3(params: {
  bucket: string;
  prefix?: string;
  region: string;
  maxMB: number;
  analyzeOnly: boolean;
  concurrency: number;
}) {
  const { bucket, prefix, region, maxMB, analyzeOnly, concurrency } = params;
  const key = process.env.LIGHTHOUSE_API_KEY;
  if (!analyzeOnly && !key) throw new Error("LIGHTHOUSE_API_KEY is required");

  const s3 = getS3Client(region, process.env.AWS_PROFILE || undefined);

  const all = await listAllObjects(s3, bucket, prefix);
  const maxBytes = maxMB * 1024 * 1024;
  const oversized = all.filter(o => (o.Size ?? 0) > maxBytes);
  const eligible = all.filter(o => !oversized.includes(o));

  console.log(`S3: s3://${bucket}${prefix ? "/" + prefix : ""}`);
  console.log(`Found ${all.length} total, ${eligible.length} eligible (${oversized.length} too large).`);
  const plannedBytes = eligible.reduce((a, o) => a + (o.Size ?? 0), 0);
  console.log(`Planned data: ${fmtBytes(plannedBytes)}`);

  if (analyzeOnly) {
    const dist = { "<1MB": 0, "1–10MB": 0, "10–50MB": 0, "≥50MB": 0 };
    for (const o of all) {
      const sz = o.Size ?? 0;
      if (sz < 1 << 20) dist["<1MB"]++;
      else if (sz < 10 << 20) dist["1–10MB"]++;
      else if (sz < 50 << 20) dist["10–50MB"]++;
      else dist["≥50MB"]++;
    }
    console.log("\nSize distribution:");
    for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${v}`);
    return;
  }

  await ensureKeyValid(key!);

  const limit = pLimit(concurrency);
  let ok = 0, fail = 0;
  const start = Date.now();

  await Promise.all(
    eligible.map(o =>
      limit(async () => {
        try {
          const buf = await downloadToBuffer(s3, bucket, o.Key!);
          const { cid, size } = await uploadBuffer(buf, key!);
          ok++;
          console.log(`✓ ${o.Key} → ${cid} (${fmtBytes(size)})`);
        } catch (err: any) {
          fail++;
          console.log(`✗ ${o.Key}: ${err.message || err}`);
        }
      })
    )
  );

  const dur = (Date.now() - start) / 1000;
  const thr = dur ? `${fmtBytes(plannedBytes / dur)}/s` : "—";
  console.log(`\nDone. ok=${ok} fail=${fail} skipped=${oversized.length} in ${dur.toFixed(1)}s (${thr})`);
}

// CLI wiring
const program = new Command();
program
  .name("lh-s3")
  .description("Migrate objects from S3 to Lighthouse/IPFS")
  .argument("<bucket>", "S3 bucket name")
  .option("--prefix <prefix>", "Prefix/folder within the bucket")
  .option("--region <region>", "AWS region (default: us-east-1)", "us-east-1")
  .option("--max <MB>", "Max file size in MB (default: 50)", (v) => parseInt(v, 10), 50)
  .option("--analyze", "Analyze only; do not upload", false)
  .option("--concurrency <n>", "Parallel uploads (default: 4)", (v) => parseInt(v, 10), 4)
  .action(async (bucket: string, opts: any) => {
    try {
      await migrateS3({
        bucket,
        prefix: opts.prefix,
        region: opts.region,
        maxMB: opts.max,
        analyzeOnly: !!opts.analyze,
        concurrency: opts.concurrency,
      });
    } catch (e: any) {
      console.error("Error:", e.message || e);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
