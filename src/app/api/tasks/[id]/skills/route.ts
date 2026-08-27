import { handle, json, requireSession } from "@/server/api";
import { setTaskSkills, getTaskSkills } from "@/server/services/goalSkills";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    return json({ data: await getTaskSkills(s.id, params.id) });
  })();
}

const bodySchema = z.object({ skillIds: z.array(z.string().uuid()) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const body = bodySchema.parse(await req.json());
    return json({ data: await setTaskSkills(s.id, params.id, body.skillIds) });
  })();
}
