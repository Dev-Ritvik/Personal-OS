import { prisma } from "@/server/db";
import { ApiError, audit, handle, idempotent, json } from "@/server/api";
import { bootstrapInput } from "@/server/validation";
import { hashPassword } from "@/server/auth/password";
import { constantTimeEqual } from "@/server/auth/password";
import { encryptSecret, generateTotpSecret, totpUri } from "@/server/auth/totp";
import { uuidv7 } from "@/server/ids";
import { ENV } from "@/server/env";
import { seedDefaults } from "@/server/services/seed";

export const dynamic = "force-dynamic";

/** GET: does the instance still need its single account? */
export async function GET() {
  const count = await prisma.user.count();
  return json({ needsSetup: count === 0 });
}

/** POST: one-time account creation, gated by SETUP_TOKEN. */
export const POST = handle(async (req: Request) => {
  const body = await req.json();
  const input = bootstrapInput.parse(body);

  if (!constantTimeEqual(input.setupToken, ENV.SETUP_TOKEN)) {
    throw new ApiError(403, "bad_setup_token", "Invalid setup token");
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    throw new ApiError(409, "already_bootstrapped", "Account already exists");
  }

  const secret = generateTotpSecret();
  const user = await prisma.user.create({
    data: {
      id: uuidv7(),
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      totpSecretEnc: encryptSecret(secret),
      timezone: input.timezone,
    },
  });

  // Idempotency is meaningless here (single-shot), kept out of the path.
  void idempotent;
  await audit(user.id, "create", "user", user.id, null);
  await seedDefaults(user.id);

  return json({
    userId: user.id,
    totpSecret: secret,
    otpauthUri: totpUri(input.email, secret),
    message:
      "Add this secret to your authenticator app now, then confirm with a code.",
  });
});
