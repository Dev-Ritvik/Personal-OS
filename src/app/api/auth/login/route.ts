import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { ApiError, audit, handle, json } from "@/server/api";
import { loginInput } from "@/server/validation";
import { verifyPassword } from "@/server/auth/password";
import { clientIp, rateLimit } from "@/server/auth/ratelimit";
import { signChallenge, TOTK_COOKIE, CHALLENGE_TTL_MS } from "@/server/auth/challenge";

export const dynamic = "force-dynamic";

/**
 * POST login step 1: email+password.
 * → TOTP enrolled: sets short-lived challenge cookie, responds {needTotp:true}
 * → setup incomplete: 409 finish_setup
 */
export const POST = handle(async (req: Request) => {
  const ip = clientIp(req);
  if (!rateLimit(`login:${ip}`, 5)) {
    throw new ApiError(429, "rate_limited", "Too many attempts; wait a minute");
  }
  const input = loginInput.parse(await req.json());
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  const bad = () => new ApiError(401, "bad_credentials", "Invalid credentials");

  if (!user || !user.passwordHash) {
    await audit("anonymous", "auth_fail", "login", input.email, { reason: "no_user" });
    throw bad();
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new ApiError(423, "locked", "Account temporarily locked");
  }

  const okPw = await verifyPassword(input.password, user.passwordHash);
  if (!okPw) {
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        lockedUntil:
          attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
      },
    });
    await audit(user.id, "auth_fail", "login", user.id, { attempts });
    throw bad();
  }

  if (!user.totpConfirmed || !user.totpSecretEnc) {
    throw new ApiError(409, "finish_setup", "Complete authenticator setup first");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  const store = await cookies();
  store.set(TOTK_COOKIE, signChallenge(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(CHALLENGE_TTL_MS / 1000),
  });
  return json({ needTotp: true });
});
