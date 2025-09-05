import fs from 'fs/promises';
import path from 'path';

export class DedupStore {
  constructor(dbPath = path.join(process.cwd(), '.cache', 'dedup-db.json')) {
    this.dbPath = dbPath;
    this.db = { // contentHash -> { cid, firstSeenAt, count }
      byHash: {},
    };
    this.ready = this.load();
  }

  async load() {
    try {
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
      const raw = await fs.readFile(this.dbPath, 'utf8');
      this.db = JSON.parse(raw);
      if (!this.db.byHash) this.db.byHash = {};
    } catch {
      // start fresh
      this.db = { byHash: {} };
      await this.flush();
    }
  }

  async flush() {
    await fs.writeFile(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  async has(hash) {
    await this.ready;
    return Boolean(this.db.byHash[hash]);
  }

  async get(hash) {
    await this.ready;
    return this.db.byHash[hash] || null;
  }

  async put(hash, cid) {
    await this.ready;
    const existing = this.db.byHash[hash];
    if (existing) {
      existing.count += 1;
    } else {
      this.db.byHash[hash] = { cid, firstSeenAt: new Date().toISOString(), count: 1 };
    }
    await this.flush();
  }
}
