import { handle, json, requireSession } from "@/server/api";
import { getSummary } from "@/server/services/financials";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await getSummary(s.id) });
});
