import { MongoClient, type Db, type WriteConcern } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectedUri = "";
let connectTask: Promise<Db | null> | null = null;
let connectTaskUri = "";
let connectEpoch = 0;

const ACKNOWLEDGED: WriteConcern = { w: "majority" };

/** Repair truncated Atlas write-concern names such as w=majorit. */
export function sanitizeMongoUri(uri: string): string {
  return uri.replace(/([?&]w=)([^&]*)/gi, (full, prefix: string, value: string) => {
    void full;
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }
    const key = decoded.trim().toLowerCase();
    if (key === "majority" || key === "1" || key === "0" || /^\d+$/.test(key)) return `${prefix}${value}`;
    if (key.startsWith("major")) return `${prefix}majority`;
    return `${prefix}${value}`;
  });
}

export function isWriteConcernError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /write concern mode named/i.test(message) || /wtimeout/i.test(message);
}

export async function closeDb(): Promise<void> {
  connectEpoch += 1;
  connectTask = null;
  connectTaskUri = "";
  const current = client;
  client = null;
  db = null;
  connectedUri = "";
  if (!current) return;
  await current.close().catch(() => undefined);
}

async function openDb(uri: string, dbName: string): Promise<Db | null> {
  const ticket = connectEpoch;
  const previous = client;
  client = null;
  db = null;
  connectedUri = "";
  if (previous) await previous.close().catch(() => undefined);
  const next = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    writeConcern: ACKNOWLEDGED,
  });
  try {
    await next.connect();
    if (ticket !== connectEpoch) {
      await next.close().catch(() => undefined);
      return null;
    }
    const database = next.db(dbName);
    client = next;
    db = database;
    connectedUri = uri;
    return database;
  } catch (err) {
    console.error("[mongo] connection failed", err);
    await next.close().catch(() => undefined);
    if (client === next) {
      client = null;
      db = null;
      connectedUri = "";
    }
    return null;
  }
}

export async function getDb(): Promise<Db | null> {
  const raw = process.env.MONGODB_URI ?? "";
  const dbName = process.env.MONGODB_DB ?? "active_management";
  if (!raw) {
    console.error("[mongo] MONGODB_URI missing");
    return null;
  }
  const uri = sanitizeMongoUri(raw);
  if (db && connectedUri === uri) return db;
  if (connectTask && connectTaskUri === uri) return connectTask;
  const task = openDb(uri, dbName);
  connectTask = task;
  connectTaskUri = uri;
  void task.finally(() => {
    if (connectTask === task) {
      connectTask = null;
      connectTaskUri = "";
    }
  });
  return task;
}

export const COLLECTIONS = {
  volSurfaces: "vol_surfaces",
  multiProducts: "multi_products",
  uploadLogs: "upload_logs",
} as const;
