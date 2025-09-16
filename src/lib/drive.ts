import { google, drive_v3 } from "googleapis";
import type { DriveScanResult } from "./types.js";


export function isWorkspace(mime?: string | null) {
  return (mime ?? "").startsWith("application/vnd.google-apps");
}

export async function listAllFiles(
  drive: drive_v3.Drive,
  folderId?: string
) {
  const folders = [folderId || "root"];
  const files: drive_v3.Schema$File[] = [];

  while (folders.length) {
    const parent = folders.shift()!;
    let pageToken: string | undefined;

    do {
      const { data } = await drive.files.list({
        q: `'${parent}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name,mimeType,size)",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 1000,
        pageToken,
      });

      for (const f of data.files ?? []) {
        if (f.mimeType === "application/vnd.google-apps.folder" && f.id) {
          folders.push(f.id);
        } else {
          files.push(f);
        }
      }
      pageToken = data.nextPageToken || undefined;
    } while (pageToken);
  }
  return files;
}

export async function downloadBuffer(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function getAboutEmail(drive: drive_v3.Drive) {
  const { data } = await drive.about.get({ fields: "user(emailAddress)" });
  return data.user?.emailAddress ?? "";
}

export async function getDriveClient(tokens: any) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials(tokens);
  return google.drive({ version: "v3", auth: oauth2 });
}

export async function scanFolder(
  drive: drive_v3.Drive,
  folderId: string | undefined,
  maxMB: number
): Promise<DriveScanResult> {
  const all = await listAllFiles(drive, folderId);
  const binaries = all.filter((f) => !isWorkspace(f.mimeType));
  const maxBytes = maxMB * 1024 * 1024;
  const oversized = binaries.filter((f) => (parseInt(f.size || "0", 10) > maxBytes));
  const eligible = binaries.filter((f) => !oversized.includes(f));

  const plannedBytes = eligible.reduce(
    (a, f) => a + (parseInt(f.size || "0", 10) || 0),
    0
  );

  const buckets = { "<1MB": 0, "1–10MB": 0, "10–50MB": 0, "≥50MB": 0 };
  for (const f of binaries) {
    const sz = parseInt(f.size || "0", 10);
    if (sz < 1 << 20) buckets["<1MB"]++;
    else if (sz < 10 << 20) buckets["1–10MB"]++;
    else if (sz < 50 << 20) buckets["10–50MB"]++;
    else buckets["≥50MB"]++;
  }

  return {
    total: all.length,
    binary: binaries.length,
    eligible: eligible.length,
    oversized: oversized.length,
    plannedBytes,
    sizeBuckets: buckets,
  };
}