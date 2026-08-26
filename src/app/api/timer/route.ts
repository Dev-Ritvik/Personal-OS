import { z } from "zod";
import { handle, idempotent, json, requireSession } from "@/server/api";
import { timerStart } from "@/server/validation";
import { runningTimer, startTimer, stopTimer } from "@/server/services/timeEntries";

export const dynamic = "force-dynamic";

const actionBody = z.object({
  action: z.enum(["start", "stop"]),
});

/** GET current running timer with server-computed elapsed seconds. */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const deviceTz =
    new URL(req.url).searchParams.get("deviceTz") ?? undefined;
  return json({
    data: await runningTimer({ userId: s.id, profileTz: s.timezone, deviceTz }),
  });
});

/**
 * POST {action:'start'|'stop', stoppedAt?} — server-authoritative validation
 * of client-captured instants (C6).
 */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const body = raw as Record<string, unknown>;
  actionBody.parse(body);
  const clientOpId = body.clientOpId as string | undefined;

  if (body.action === "start") {
    const input = timerStart.parse(raw);
    const { result, replayed } = await idempotent(
      s.id,
      clientOpId,
      "timer.start",
      () =>
        startTimer(
          { userId: s.id, profileTz: s.timezone, deviceTz: input.deviceTz ?? undefined },
          input,
        ),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  }

  const stoppedAt =
    typeof body.stoppedAt === "string" ? body.stoppedAt : undefined;
  const { result, replayed } = await idempotent(
    s.id,
    clientOpId,
    "timer.stop",
    () => stopTimer({ userId: s.id, profileTz: s.timezone }, { stoppedAt }),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
