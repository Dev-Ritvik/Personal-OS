import { prisma } from "@/server/db";
import { handle, json, requireSession } from "@/server/api";
import { settingsUpdate } from "@/server/validation";
import { revokeSessionById } from "@/server/auth/session";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** GET profile + active session list. */
export const GET = handle(async () => {
  const s = await requireSession();
  const sessions = await prisma.session.findMany({
    where: { userId: s.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: s.id },
    select: {
      email: true,
      timezone: true,
      wakingStartMin: true,
      wakingEndMin: true,
      prefs: true,
      totpConfirmed: true,
    },
  });
  return json({ user, sessions, currentSessionId: s.sessionId });
});

/** PATCH profile/settings. */
export const PATCH = handle(async (req: Request) => {
  const s = await requireSession();
  const input = settingsUpdate.parse(await req.json());
  const user = await prisma.user.update({
    where: { id: s.id },
    data: {
      timezone: input.timezone,
      wakingStartMin: input.wakingStartMin,
      wakingEndMin: input.wakingEndMin,
      prefs: input.prefs as object | undefined,
    },
  });
  return json({
    ok: true,
    user: {
      timezone: user.timezone,
      wakingStartMin: user.wakingStartMin,
      wakingEndMin: user.wakingEndMin,
    },
  });
});

/** DELETE: revoke an arbitrary session of this account. */
export const DELETE = handle(async (req: Request) => {
  const s = await requireSession();
  const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(
    await req.json(),
  );
  const okRevoke = await revokeSessionById(s.id, sessionId);
  return json({ ok: okRevoke });
});
