import { prisma } from "@/server/db";
import { ApiError, audit, handle, json } from "@/server/api";
import { totpInput } from "@/server/validation";
import { decryptSecret, verifyTotp } from "@/server/auth/totp";
import { createSession } from "@/server/auth/session";
import { clientIp, rateLimit } from "@/server/auth/ratelimit";

export const dynamic = "force-dynamic";

/** POST: confirm TOTP during bootstrap; marks enrollment complete + logs in. */
export const POST = handle(async (req: Request) => {
  if (!rateLimit(`bootstrap-confirm:${clientIp(req)}`, 10)) {
    throw new ApiError(429, "rate_limited", "Too many attempts; wait a minute");
  }
  const { code } = totpInput.parse(await req.json());

  const user = await prisma.user.findFirst();
  if (!user || user.totpConfirmed || !user.totpSecretEnc) {
    throw new ApiError(409, "not_pending", "No pending bootstrap confirmation");
  }
  const okCode = verifyTotp(decryptSecret(user.totpSecretEnc), code);
  if (!okCode) {
    await audit(user.id, "auth_fail", "totp_confirm", user.id, null);
    throw new ApiError(401, "bad_code", "Invalid authenticator code");
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpConfirmed: true } });
  await createSession(user.id, req.headers.get("user-agent"));
  await audit(user.id, "auth_success", "bootstrap_complete", user.id, null);
  return json({ ok: true });
});
