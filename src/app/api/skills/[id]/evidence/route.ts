import { handle, json, requireSession } from "@/server/api";
import { listEvidence, addEvidence } from "@/server/services/skillEvidence";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    return json({ data: await listEvidence(s.id, params.id) });
  })();
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  epistemicClass: z.enum(["FACT", "SELF_REPORT", "INFERENCE", "ASSESSMENT"]),
  sourceType: z.string().max(100).nullish(),
  sourceId: z.string().max(100).nullish(),
  assessedLevel: z.enum(["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"]).nullish(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const body = createSchema.parse(await req.json());
    return json({ data: await addEvidence(s.id, params.id, body) });
  })();
}
