import { handle, json } from "@/server/api";
import { bootstrapInput } from "@/server/validation";
import { createAccountOrRecover } from "@/server/services/bootstrap";
import { hashPassword } from "@/server/auth/password";
import { clientIp, rateLimit } from "@/server/auth/ratelimit";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** GET: does the instance still need its single account? */
export async function GET() {
  return handle(async () => {
    const count = await prisma.user.count();
    return json({ needsSetup: count === 0 });
  })();
}

/**
 * POST: first-run setup OR pre-confirmation secret recovery (C5).
 * Rate limited (5/min/IP) per §15; setup token constant-time compared inside.
 */
export const POST = handle(async (req: Request) => {
  if (!rateLimit(`bootstrap:${clientIp(req)}`, 5)) {
    return json(
      { error: { code: "rate_limited", message: "Too many attempts; wait a minute" } },
      { status: 429 },
    );
  }
  const raw = await req.json();
  const input = bootstrapInput.parse(raw);
  const passwordHash = await hashPassword(input.password);

  const result = await createAccountOrRecover({
    setupToken: input.setupToken,
    email: input.email,
    passwordHash,
    timezone: input.timezone,
  });

  return json({
    kind: result.kind,
    userIdEmail: result.email,
    totpSecret: result.totpSecret,
    otpauthUri: result.otpauthUri,
    message:
      result.kind === "recovered"
        ? "Previous authenticator secret is now invalid. Re-enroll with this one."
        : "Add this secret to your authenticator app now, then confirm with a code.",
  });
});
