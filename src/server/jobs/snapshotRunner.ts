import { prisma } from "../db";
import { ApiError, audit, requireSession } from "../api";
import { constantTimeEqual } from "../auth/password";
import { ENV } from "../env";
import { z } from "zod";
import { snapshotRange } from "../validation";
import { persistSnapshots } from "../services/snapshot";
import { addDays, todayInTz } from "@/lib/metrics/dates";

export interface JobActor {
  id: string;
  timezone: string;
  wakingStartMin: number;
  wakingEndMin: number;
}

/**
 * Single execution path for the snapshot job — used by BOTH the Vercel-Cron
 * GET and the manual/session POST (Phase-5 remediation: no duplicated logic).
 *
 * Authorization semantics:
 *   - `Authorization: Bearer <CRON_SECRET>` present → strict constant-time
 *     validation; invalid ⇒ 401 (never falls through to session).
 *   - Header absent → session authentication (manual recompute from UI).
 */
export async function authorizeSnapshotRequest(req: Request): Promise<JobActor> {
  const auth = req.headers.get("authorization");

  if (auth !== null) {
    if (!ENV.CRON_SECRET) {
      throw new ApiError(503, "cron_disabled", "CRON_SECRET is not configured");
    }
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!presented || !constantTimeEqual(presented, ENV.CRON_SECRET)) {
      throw new ApiError(401, "bad_cron_secret", "Invalid cron credentials");
    }
    const user = await prisma.user.findFirst();
    if (!user) throw new ApiError(404, "no_user", "No account exists");
    return {
      id: user.id,
      timezone: user.timezone,
      wakingStartMin: user.wakingStartMin,
      wakingEndMin: user.wakingEndMin,
    };
  }

  const s = await requireSession();
  return { id: s.id, timezone: s.timezone, wakingStartMin: s.wakingStartMin, wakingEndMin: s.wakingEndMin };
}

const DEFAULT_DAYS = 90;

/** Shared execution: range resolution + persistence. Returns a summary. */
export async function executeSnapshotJob(actor: JobActor, body: unknown) {
  const parsed =
    body && typeof body === "object" && "from" in body
      ? snapshotRange.parse(body)
      : null;

  const today = todayInTz(actor.timezone);
  const to = parsed?.to ?? today;
  const from = parsed?.from ?? addDays(today, -DEFAULT_DAYS);

  const res = await persistSnapshots(actor, from, to);
  await audit(actor.id, "snapshot_job", "metric_snapshots", undefined, res);
  return { ok: true as const, ...res, range: { from, to } };
}

const bodySchema = z.object({}).passthrough();

/** Normalizes possibly-empty bodies for GET/POST parity. */
export async function readJobBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text) return {};
    return bodySchema.parse(JSON.parse(text));
  } catch {
    return {};
  }
}
