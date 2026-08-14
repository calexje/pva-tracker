import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
let cached = (global as any)._mongoose as
  | { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
  | undefined;
if (!cached) cached = (global as any)._mongoose = { conn: null, promise: null };

export async function db() {
  if (cached!.conn) return cached!.conn;
  if (!uri) throw new Error("MONGODB_URI is not set");
  // 5s instead of the 30s default: a serverless function has no business
  // holding a request open for half a minute because the database is
  // unreachable. Misconfiguration should surface fast.
  if (!cached!.promise)
    cached!.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    cached!.conn = await cached!.promise;
  } catch (err) {
    // A rejected promise must not stay cached: `global` outlives a hot reload
    // locally and a warm serverless instance in production, so leaving it here
    // makes one failed connect permanent for every later request.
    cached!.promise = null;
    throw err;
  }
  return cached!.conn;
}
