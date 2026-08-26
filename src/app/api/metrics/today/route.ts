import { handle, json, requireSession } from "@/server/api";
import { assembleToday } from "@/server/services/today";

export const dynamic = "force-dynamic";

/** GET the Today dashboard payload (?deviceTz= for frozen local dates). */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const deviceTz =
    new URL(req.url).searchParams.get("deviceTz") ?? undefined;
  return json({ data: await assembleToday(s, deviceTz) });
});
