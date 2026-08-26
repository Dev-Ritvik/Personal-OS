/**
 * In-memory sliding-window rate limiter for auth endpoints.
 * Sufficient for single-instance deployment (Vercel functions are per-region
 * isolated but N=1 traffic makes cross-instance drift irrelevant).
 * Documented limitation in ARCHITECTURE.md §15.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 60_000);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

/**
 * Returns true when allowed. Records the hit otherwise.
 */
export function rateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < 60_000);
  if (bucket.hits.length >= maxPerMinute) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}

/** Best-effort client IP from proxy headers (Vercel) or request metadata. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}
