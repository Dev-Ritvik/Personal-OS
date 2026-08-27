import { handle, json, requireSession } from "@/server/api";
import { listByGoal, linkGoalSkill, unlinkGoalSkill } from "@/server/services/goalSkills";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    return json({ data: await listByGoal(s.id, params.id) });
  })();
}

const postSchema = z.object({ skillId: z.string().uuid(), requiredLevel: z.enum(["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"]).nullish(), notes: z.string().max(500).nullish() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const body = postSchema.parse(await req.json());
    return json({ data: await linkGoalSkill(s.id, params.id, body) });
  })();
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const skillId = new URL(req.url).searchParams.get("skillId");
    if (!skillId) throw new Error("skillId required");
    await unlinkGoalSkill(s.id, params.id, skillId);
    return json({ ok: true });
  })();
}
