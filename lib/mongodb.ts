import dns from "node:dns";
import { Db, MongoClient } from "mongodb";

function configureMongoDns(): void {
  const raw = process.env.MONGODB_DNS_SERVERS?.trim();
  const servers = raw
    ? raw.split(",").map((entry) => entry.trim()).filter(Boolean)
    : process.platform === "win32" && process.env.VERCEL !== "1"
      ? ["8.8.8.8", "1.1.1.1"]
      : [];
  if (servers.length > 0) dns.setServers(servers);
}

configureMongoDns();

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var _mongoClientUri: string | undefined;
}

function validateMongoUri(uri: string): void {
  const trimmed = uri.trim();

  if (!trimmed.startsWith("mongodb://") && !trimmed.startsWith("mongodb+srv://")) {
    throw new Error(
      `MONGODB_URI must start with "mongodb://" or "mongodb+srv://". ` +
        `Got "${trimmed.slice(0, 30)}..." — check that MONGODB_URI is not set to a phone number in Vercel/local env.`
    );
  }
}

function isSrvLookupError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("querysrv") || lower.includes("srv");
}

/** Try the other URI when SRV/DNS fails or a replica TLS handshake hangs. */
function shouldTryAlternateMongoUri(message: string): boolean {
  if (isSrvLookupError(message)) return true;
  return /secureConnect|timed out|server selection|ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(
    message
  );
}

function mongoClientOptions() {
  return {
    /** Fail fast on a bad replica so another seed can be selected. */
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 20_000,
    /** Serverless / long-lived API: avoid stale sockets. */
    maxIdleTimeMS: 60_000,
    ...(process.platform === "win32" ? { family: 4 as const } : {}),
  };
}

/** Hosted on Vercel — SRV DNS usually works. Local API often sets NODE_ENV=production but is not Vercel. */
function preferSrvUriFirst(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV?.trim());
}

function orderedMongoUris(): string[] {
  const srvUri = process.env.MONGODB_URI?.trim();
  const standardUri = process.env.MONGODB_URI_STANDARD?.trim();
  const ordered = preferSrvUriFirst()
    ? [srvUri, standardUri]
    : [standardUri, srvUri];

  const unique: string[] = [];
  for (const uri of ordered) {
    if (uri && !unique.includes(uri)) unique.push(uri);
  }
  return unique;
}

function getClientForUri(uri: string): MongoClient {
  validateMongoUri(uri);

  if (global._mongoClient && global._mongoClientUri === uri) {
    return global._mongoClient;
  }

  if (global._mongoClient) {
    void global._mongoClient.close().catch(() => undefined);
  }

  global._mongoClient = new MongoClient(uri, mongoClientOptions());
  global._mongoClientUri = uri;
  return global._mongoClient;
}

export async function getDb(): Promise<Db> {
  const uris = orderedMongoUris();
  if (uris.length === 0) {
    throw new Error(
      "MONGODB_URI is not defined. Set MONGODB_URI or MONGODB_URI_STANDARD in environment variables."
    );
  }

  let lastError: unknown;

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i]!;
    try {
      const client = getClientForUri(uri);
      await client.connect();
      return client.db("twilio-sms");
    } catch (error) {
      lastError = error;
      const message =
        error instanceof Error ? error.message : "Unknown database error";

      const hasAnotherUri = i < uris.length - 1;
      if (hasAnotherUri && shouldTryAlternateMongoUri(message)) {
        console.warn(
          `MongoDB connect failed (${message.slice(0, 120)}); retrying with alternate connection string.`
        );
        continue;
      }
      break;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Unknown database error";
  const hints: string[] = [];
  if (isSrvLookupError(message)) {
    hints.push(
      "On Windows, SRV DNS may be blocked — set MONGODB_URI_STANDARD in .env.local (Atlas → Connect → Drivers, uncheck SRV) and/or MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1"
    );
  }
  if (/secureConnect/i.test(message)) {
    hints.push(
      "TLS to one Atlas node may be hanging — in Atlas check cluster health; set MONGODB_URI to the SRV string on Vercel; locally use MONGODB_URI_STANDARD with ssl=true or MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1."
    );
  }
  if (/timed out|server selection/i.test(message)) {
    hints.push(
      "Atlas Network Access must allow your IP (local) and 0.0.0.0/0 or Vercel static egress for production. Port 27017 outbound must be open."
    );
  }
  const hint = hints.length > 0 ? ` ${hints.join(" ")}` : "";
  throw new Error(`MongoDB connection failed: ${message}${hint}`);
}
