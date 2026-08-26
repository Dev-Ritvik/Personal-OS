import { z } from "zod";
import { cookies } from "next/headers";
import { handle, json, requireSession } from "@/server/api";
import { deleteEverything } from "@/server/services/deletion";
import { SESSION_COOKIE } from "@/server/auth/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ confirm: z.string() });

/** POST /api/me/delete-all — destructive, phrase-confirmed, audited. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const { confirm } = bodySchema.parse(await req.json());
  await deleteEverything(s.id, confirm);

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return json({ ok: true, message: "All data deleted. This instance now requires bootstrap." });
});
