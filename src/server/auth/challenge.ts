import { createHmac } from "node:crypto";

/**
 * Short-lived signed TOTP challenge between password step and code step.
 * Stateless (HMAC), httpOnly cookie carried, 5-minute TTL.
 */
const TOTK_COOKIE = "pos_totk";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function hmac(): Buffer {
  return Buffer.from(process.env.APP_SECRET!, "hex");
}

export function signChallenge(userId: string, nowMs = Date.now()): string {
  const exp = nowMs + CHALLENGE_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", hmac()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyChallenge(value: string | undefined): string | null {
  if (!value) return null;
  const [userId, expStr, sig] = value.split(".");
  if (!userId || !expStr || !sig) return null;
  const expected = createHmac("sha256", hmac())
    .update(`${userId}.${expStr}`)
    .digest("base64url");
  if (expected !== sig) return null;
  if (Number(expStr) < Date.now()) return null;
  return userId;
}

export { TOTK_COOKIE, CHALLENGE_TTL_MS };
