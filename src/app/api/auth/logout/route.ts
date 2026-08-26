import { handle, json } from "@/server/api";
import { revokeCurrentSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const POST = handle(async () => {
  await revokeCurrentSession();
  return json({ ok: true });
});
