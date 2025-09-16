export type UserID = string;

export type DriveScanResult = {
  total: number;
  binary: number;
  eligible: number;
  oversized: number;
  plannedBytes: number;
  sizeBuckets: Record<string, number>;
};

export type MigrationItem = {
  fileId: string;
  name: string;
  cid?: string;
  error?: string;
  bytes?: number;
};

export type MigrationStatus = {
  id: string;
  userId: string;
  startedAt: number;
  finishedAt?: number;
  ok: number;
  fail: number;
  skipped: number;
  items: MigrationItem[];
};
