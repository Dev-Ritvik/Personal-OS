import { handle, idempotent, json, requireSession } from "@/server/api";
import { quickLog } from "@/server/validation";
import { quickLog as quickLogSvc, entriesForDate } from "@/server/services/timeEntries";
import { todayInTz } from "@/lib/metrics/dates";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD — full day ledger including voided/amended rows. */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const date =
    url.searchParams.get("date") ?? todayInTz(url.searchParams.get("deviceTz") ?? s.timezone);
  return json({
    data: await entriesForDate(
      { userId: s.id, profileTz: s.timezone, deviceTz: url.searchParams.get("deviceTz") ?? undefined },
      date,
    ),
  });
});

/** POST quick-log capture. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const input = quickLog.parse(raw);
  const { result, replayed } = await idempotent(
    s.id,
    raw?.clientOpId as string | undefined,
    "entry.quick_log",
    () =>
      quickLogSvc(
        { userId: s.id, profileTz: s.timezone, deviceTz: input.deviceTz ?? undefined },
        input,
      ),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
