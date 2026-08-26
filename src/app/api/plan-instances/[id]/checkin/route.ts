import { handle, idempotent, json, requireSession } from "@/server/api";
import { checkinInput } from "@/server/validation";
import { checkin } from "@/server/services/plans";

export const dynamic = "force-dynamic";

/** POST check-in on a scheduled plan instance. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = checkinInput.parse(raw);
    const { result, replayed } = await idempotent(
      s.id,
      raw?.clientOpId as string | undefined,
      `plan.checkin:${params.id}`,
      () => checkin(s.id, params.id, input),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}
