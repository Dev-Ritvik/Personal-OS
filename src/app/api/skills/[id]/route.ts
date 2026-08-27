import { handle, json, requireSession } from "@/server/api";
import { getSkill, updateSkill } from "@/server/services/skills";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    return json({ data: await getSkill(s.id, params.id) });
  })();
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullish(),
  category: z.enum(["TECHNICAL", "COMMUNICATION", "BUSINESS", "CAREER", "INDEPENDENT_LIVING", "PERSONAL_PERFORMANCE", "INTERNATIONAL"]).optional(),
  currentLevel: z.enum(["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"]).optional(),
  targetLevel: z.enum(["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"]).optional(),
  importance: z.number().int().min(1).max(3).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  nextReviewAt: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const body = patchSchema.parse(await req.json());
    return json({ data: await updateSkill(s.id, params.id, body) });
  })();
}
