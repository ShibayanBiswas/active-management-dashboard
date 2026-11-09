import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { MongoClient } from "mongodb";

import { sanitizeMongoUri } from "../lib/db/mongo";

async function main() {
  const truncated = "mongodb+srv://u:p@cluster0.mongodb.net/db?retryWrites=true&w=majorit";
  if (!sanitizeMongoUri(truncated).includes("w=majority")) {
    console.error("FAIL sanitizeMongoUri did not repair w=majorit");
    process.exit(1);
  }
  if (!sanitizeMongoUri("mongodb+srv://u:p@host/db?w=majority").includes("w=majority")) {
    console.error("FAIL sanitizeMongoUri changed a correct majority concern");
    process.exit(1);
  }
  console.log("PASS sanitizeMongoUri repairs truncated majority");

  const uri = sanitizeMongoUri(process.env.MONGODB_URI ?? "");
  console.log("uri host:", uri.includes("mongodb.net") ? "atlas" : "missing");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000, writeConcern: { w: "majority" } });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "active_management");
    console.log("connected to", db.databaseName);
    const cols = await db.listCollections().toArray();
    console.log(
      "collections",
      cols.map((c) => c.name),
    );
    await client.close();
  } catch (e) {
    console.error("FAIL", e);
    process.exit(1);
  }
}

main();
