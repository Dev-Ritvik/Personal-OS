import { prisma } from "@/server/db";
import { ApiError, handle, json, requireSession } from "@/server/api";
import { snapshotRange } from "@/server/validation";
import { persistSnapshots } from "@/server/services/snapshot";
import { addDays, todayInTz } from "@/lib/metrics/dates";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 90;

type Actor = { id: string; timezone: string; wakingStartMin: number; wakingEndMin: number };

async function authorize(req: Request): Promise<Actor> {
  // Cron path: Bearer CRON_SECRET operates on the single account.
  const auth = req.headers.get("authorization");
  if (
    auth === `Bearer ${process.env.CRON_SECRET}` &&
    process.env.CRON_SECRET &&
    process.env.CRON_SECRET.length > 0
  ) {
    const user = await prisma.user.findFirst();
    if (!user) throw new ApiError(404, "no_user", "No account exists");
    return { id: user.id, timezone: user.timezone, wakingStartMin: user.wakingStartMin, wakingEndMin: user.wakingEndMin };
  }
  const s = await requireSession();
  return { id: s.id, timezone: s.timezone, wakingStartMin: s.wakingStartMin, wakingEndMin: s.wakingEndMin };
}

/**
 * POST /api/jobs/snapshot
 * Body: {} (last 90d for session; cron uses same default) or {from,to}.
 * Nightly via Vercel Cron; manual recompute button calls with explicit range.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await authorize(req);
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const parsed = body && typeof body === "object" && "from" in body
      ? snapshotRange.parse(body)
      : null;

    const today = todayInTz(actor.timezone);
    const to = parsed?.to ?? today;
    const from = parsed?.from ?? addDays(today, -DEFAULT_DAYS);

    const res = await persistSnapshots(actor, from, to);
    return json({ ok: true, ...res, range: { from, to } });
  })();
}
