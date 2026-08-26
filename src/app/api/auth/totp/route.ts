import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { ApiError, audit, handle, json } from "@/server/api";
import { totpInput } from "@/server/validation";
import { decryptSecret, verifyTotp } from "@/server/auth/totp";
import { createSession } from "@/server/auth/session";
import { verifyChallenge, TOTK_COOKIE } from "@/server/auth/challenge";
import { clientIp, rateLimit } from "@/server/auth/ratelimit";

export const dynamic = "force-dynamic";

/** POST login step 2: verify TOTP against the challenge cookie → session. */
export const POST = handle(async (req: Request) => {
  if (!rateLimit(`totp:${clientIp(req)}`, 10)) {
    throw new ApiError(429, "rate_limited", "Too many attempts; wait a minute");
  }
  const { code } = totpInput.parse(await req.json());

  const store = await cookies();
  const userId = verifyChallenge(store.get(TOTK_COOKIE)?.value);
  if (!userId) {
    throw new ApiError(401, "challenge_expired", "Restart the login flow");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecretEnc || !user.totpConfirmed) {
    throw new ApiError(400, "not_enrolled", "TOTP not enrolled");
  }

  if (!verifyTotp(decryptSecret(user.totpSecretEnc), code)) {
    await audit(user.id, "auth_fail", "totp", user.id, null);
    throw new ApiError(401, "bad_code", "Invalid authenticator code");
  }

  await createSession(user.id, req.headers.get("user-agent"));
  store.delete(TOTK_COOKIE);
  await audit(user.id, "auth_success", "login_complete", user.id, null);
  return json({ ok: true });
});
