import { handle, json, requireSession } from "@/server/api";
import { todayInTz } from "@/lib/metrics/dates";
import { getLifestyleGaps } from "@/server/services/lifestyle";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const today = url.searchParams.get("today") ?? todayInTz(s.timezone);
  const data = await getLifestyleGaps(s.id, today);
  return json({ data });
});
