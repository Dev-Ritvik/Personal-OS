import { handle, json, requireSession } from "@/server/api";
import { assembleCommandBrief } from "@/server/services/command";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const today = url.searchParams.get("today") ?? undefined;
  const data = await assembleCommandBrief(s, today);
  return json({ data });
});
