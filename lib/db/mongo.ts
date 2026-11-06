import { MongoClient, type Db, type WriteConcern } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectedUri = "";
let connectTask: Promise<Db | null> | null = null;
let connectTaskUri = "";

const ACKNOWLEDGED: WriteConcern = { w: "majority" };

/** Repair truncated Atlas write-concern names such as w=majorit. */
function sanitizeMongoUri(uri: string): string {
  return uri.replace(/([?&]w=)([^&]*)/gi, (_full, prefix: string, value: string) => {
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }
    const key = decoded.trim().toLowerCase();
    if (key === "majority" || /^\d+$/.test(key)) return `${prefix}${value}`;
    if (key.startsWith("major")) return `${prefix}majority`;
    return `${prefix}${value}`;
  });
}

async function openDb(uri: string, dbName: string): Promise<Db | null> {
  const previous = client;
  client = null;
  db = null;
  connectedUri = "";
  if (previous) await previous.close().catch(() => undefined);
  const next = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, writeConcern: ACKNOWLEDGED });
  try {
    await next.connect();
    client = next;
    db = next.db(dbName);
    connectedUri = uri;
    return db;
  } catch (err) {
    console.error("[mongo] connection failed", err instanceof Error ? err.message : err);
    await next.close().catch(() => undefined);
    return null;
  }
}

/** Null when MONGODB_URI is unset or the cluster is unreachable: callers fall back to the seed. */
export async function getDb(): Promise<Db | null> {
  const raw = process.env.MONGODB_URI ?? "";
  const dbName = process.env.MONGODB_DB ?? "active_management";
  if (!raw) return null;
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
  products: "products",
  volSurfaces: "vol_surfaces",
  optionChains: "option_chains",
  fixings: "fixings",
  uploadLogs: "upload_logs",
} as const;
