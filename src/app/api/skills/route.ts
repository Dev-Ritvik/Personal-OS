import { handle, json, requireSession } from "@/server/api";
import { listSkills, createSkill } from "@/server/services/skills";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  return json({
    data: await listSkills(s.id, {
      category: url.searchParams.get("category") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    }),
  });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(["TECHNICAL", "COMMUNICATION", "BUSINESS", "CAREER", "INDEPENDENT_LIVING", "PERSONAL_PERFORMANCE", "INTERNATIONAL"]),
  description: z.string().max(1000).nullish(),
  currentLevel: z.enum(["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"]).optional(),
  targetLevel: z.enum(["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"]).optional(),
  importance: z.number().int().min(1).max(3).optional(),
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const body = createSchema.parse(await req.json());
  return json({ data: await createSkill(s.id, body) });
});
