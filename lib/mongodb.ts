import { Db, MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
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

function getClient(): MongoClient {
  const srvUri = process.env.MONGODB_URI?.trim();
  const standardUri = process.env.MONGODB_URI_STANDARD?.trim();

  // Atlas SRV is the preferred production connection. The standard seed-list
  // URI remains first locally because some Windows DNS setups block SRV lookups.
  const uri =
    process.env.NODE_ENV === "production"
      ? srvUri || standardUri
      : standardUri || srvUri;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not defined. Set MONGODB_URI or MONGODB_URI_STANDARD in environment variables."
    );
  }

  validateMongoUri(uri);

  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  }
  return global._mongoClient;
}

export async function getDb(): Promise<Db> {
  try {
    const client = getClient();
    await client.connect();
    return client.db("twilio-sms");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";
    throw new Error(`MongoDB connection failed: ${message}`);
  }
}
