const memoryBuckets = new Map<string, number[]>();

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function enforceRateLimit(key: string, options: { limit: number; windowMs: number }) {
  const now = Date.now();
  const bucket = memoryBuckets.get(key) || [];
  const recent = bucket.filter((ts) => now - ts < options.windowMs);

  if (recent.length >= options.limit) {
    throw new RateLimitError();
  }

  recent.push(now);
  memoryBuckets.set(key, recent);
}

