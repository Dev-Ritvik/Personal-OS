import { handle, json, requireSession } from "@/server/api";
import { todayInTz, addDays, dateRange } from "@/lib/metrics/dates";
import { buildDayFacts } from "@/lib/metrics/facts";
import { loadRawInputs } from "@/server/services/factsSource";
import { estimateCapacity, todayPlannedMinutes, overplanningSeverity } from "@/lib/personal/capacity";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const today = todayInTz(s.timezone);
  const dates = dateRange(addDays(today, -29), today);
  const raw = await loadRawInputs(s.id, dates, {
    timezone: s.timezone,
    wakingStartMin: s.wakingStartMin,
    wakingEndMin: s.wakingEndMin,
  });
  const facts = buildDayFacts(dates, raw);
  const cap = estimateCapacity(facts);
  const planned = todayPlannedMinutes(facts, today);
  const over = overplanningSeverity(planned, cap);
  return json({ data: { today, capacity: cap, plannedToday: planned, overplanning: over } });
});
