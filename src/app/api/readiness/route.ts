import { handle, json, requireSession } from "@/server/api";
import { computeReadiness } from "@/server/services/readiness";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await computeReadiness(s.id) });
});
