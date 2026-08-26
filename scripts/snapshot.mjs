/**
 * Snapshot job runner for cron / manual use.
 * Usage:
 *   CRON_SECRET=... node scripts/snapshot.mjs                # last 90d
 *   CRON_SECRET=... node scripts/snapshot.mjs 2026-01-01 2026-03-01
 * Without CRON_SECRET set in env, uses SESSION_COOKIE env var instead.
 */
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";

const [, , from, to] = process.argv;
const headers = {};
if (process.env.CRON_SECRET) {
  headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
} else if (process.env.SESSION_COOKIE) {
  headers.cookie = process.env.SESSION_COOKIE;
} else {
  console.error("Need CRON_SECRET or SESSION_COOKIE env");
  process.exit(1);
}

const res = await fetch(`${BASE}/api/jobs/snapshot`, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(from && to ? { from, to } : {}),
});
const body = await res.json().catch(() => null);
console.log(res.status, JSON.stringify(body));
process.exit(res.ok ? 0 : 1);
