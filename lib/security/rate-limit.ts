/**
 * In-memory rate limiter.
 *
 * LIMITATION: On serverless platforms (Vercel, AWS Lambda) each cold-start
 * gets a fresh Map, so rate limits only apply within a single isolate
 * lifetime. For production-grade rate limiting, replace with a persistent
 * store (e.g. Upstash Redis, Vercel KV).
 */

const MAX_BUCKETS = 10_000;
const memoryBuckets = new Map<string, number[]>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

function pruneStaleEntries(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && memoryBuckets.size < MAX_BUCKETS) return;
  lastCleanup = now;

  for (const [key, timestamps] of memoryBuckets) {
    const recent = timestamps.filter((ts) => now - ts < windowMs);
    if (recent.length === 0) {
      memoryBuckets.delete(key);
    } else {
      memoryBuckets.set(key, recent);
    }
  }
}

export function enforceRateLimit(key: string, options: { limit: number; windowMs: number }) {
  const now = Date.now();
  pruneStaleEntries(options.windowMs);

  const bucket = memoryBuckets.get(key) || [];
  const recent = bucket.filter((ts) => now - ts < options.windowMs);

  if (recent.length >= options.limit) {
    throw new RateLimitError();
  }

  recent.push(now);
  memoryBuckets.set(key, recent);
}
