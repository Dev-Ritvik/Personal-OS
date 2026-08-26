import { z } from "zod";
import { handle, idempotent, json, requireSession } from "@/server/api";
import { timerStart } from "@/server/validation";
import { runningTimer, startTimer, stopTimer } from "@/server/services/timeEntries";

export const dynamic = "force-dynamic";

const actionBody = z.object({ action: z.enum(["start", "stop"]) });

/** GET current running timer with server-computed elapsed seconds. */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const deviceTz =
    new URL(req.url).searchParams.get("deviceTz") ?? undefined;
  return json({
    data: await runningTimer({ userId: s.id, profileTz: s.timezone, deviceTz }),
  });
});

/** POST {action:'start'|'stop'} — server-authoritative instants (AC2). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  actionBody.parse(raw);
  const clientOpId = raw?.clientOpId as string | undefined;

  if ((raw as { action: string }).action === "start") {
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

  const { result, replayed } = await idempotent(
    s.id,
    clientOpId,
    "timer.stop",
    () => stopTimer({ userId: s.id, profileTz: s.timezone }),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
