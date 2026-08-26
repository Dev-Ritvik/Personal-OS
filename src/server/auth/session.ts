import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";
import { uuidv7 } from "../ids";

export const SESSION_COOKIE = "pos_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days, sliding

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  email: string;
  timezone: string;
  wakingStartMin: number;
  wakingEndMin: number;
  prefs: Record<string, unknown>;
  sessionId: string;
}

/** Issue a session and set the httpOnly cookie. Returns raw token (rarely needed). */
export async function createSession(
  userId: string,
  userAgent: string | null,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const store = await cookies();
  const session = await prisma.session.create({
    data: {
      id: uuidv7(),
      userId,
      tokenHash: hashToken(token),
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  void session;
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Resolve the caller's user from cookie; null when absent/expired/revoked. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  // Sliding expiry + throttled lastSeen update.
  if (Date.now() - row.lastSeenAt.getTime() > 3600_000) {
    await prisma.$transaction([
      prisma.session.update({
        where: { id: row.id },
        data: {
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      }),
    ]);
  }

  return {
    id: row.userId,
    email: row.user.email,
    timezone: row.user.timezone,
    wakingStartMin: row.user.wakingStartMin,
    wakingEndMin: row.user.wakingEndMin,
    prefs: (row.user.prefs as Record<string, unknown>) ?? {},
    sessionId: row.id,
  };
}

export async function revokeCurrentSession(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await prisma.session.update({
    where: { id: user.sessionId },
    data: { revokedAt: new Date() },
  });
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function revokeSessionById(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const res = await prisma.session.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}
