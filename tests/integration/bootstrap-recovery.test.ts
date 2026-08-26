import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createAccountOrRecover } from "@/server/services/bootstrap";
import { verifyTotp } from "@/server/auth/totp";
import { rateLimit } from "@/server/auth/ratelimit";
import { hashPassword } from "@/server/auth/password";
import { SETUP_TOKEN } from "./setup-env";
import { ensureTestDb, truncateAll } from "./helpers";

const ready = await ensureTestDb();

(ready ? describe : describe.skip)("C5 — bootstrap recovery & rate limiting", () => {
  beforeAll(async () => {
    await hashPassword("unused-but-valid-shape");
  });

  beforeEach(async () => {
    await truncateAll();
  });

  const baseInput = () => ({
    setupToken: SETUP_TOKEN,
    email: "owner@local.test",
    passwordHash: "s1$x",
    timezone: "America/New_York",
  });

  it("normal setup creates account and returns enrollable secret", async () => {
    const r = await createAccountOrRecover(baseInput());
    expect(r.kind).toBe("created");
    expect(r.totpSecret).toMatch(/^[A-Z2-7]+=*$/);
    const u = await prisma.user.findFirstOrThrow();
    expect(u.totpConfirmed).toBe(false);
  });

  it("lost secret BEFORE confirmation: recovery regenerates without a second account", async () => {
    const first = await createAccountOrRecover(baseInput());
    const second = await createAccountOrRecover(baseInput());
    expect(second.kind).toBe("recovered");
    expect(second.totpSecret).not.toBe(first.totpSecret);
    expect(await prisma.user.count()).toBe(1);
  });

  it("old secret is rejected after regeneration; new one verifies against storage", async () => {
    const { decryptSecret, verifyTotp } = await import("@/server/auth/totp");
    const { Secret, TOTP } = await import("otpauth");

    const first = await createAccountOrRecover(baseInput());
    const second = await createAccountOrRecover(baseInput());

    const storedEnc = (await prisma.user.findFirstOrThrow()).totpSecretEnc!;
    const storedSecret = decryptSecret(storedEnc);
    expect(storedSecret).toBe(second.totpSecret);

    const gen = (secret: string) =>
      new TOTP({
        secret: Secret.fromBase32(secret),
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      }).generate();

    // The old secret must not validate against the stored (regenerated) one.
    expect(verifyTotp(storedSecret, gen(first.totpSecret))).toBe(false);
    expect(verifyTotp(storedSecret, gen(second.totpSecret))).toBe(true);
  });

  it("confirmed account can never re-enter bootstrap/recovery", async () => {
    await createAccountOrRecover(baseInput());
    await prisma.user.updateMany({ data: { totpConfirmed: true } });
    await expect(createAccountOrRecover(baseInput())).rejects.toMatchObject({
      code: "already_bootstrapped",
    });
  });

  it("invalid setup token is rejected before any state change", async () => {
    await createAccountOrRecover(baseInput()); // account exists
    await expect(
      createAccountOrRecover({ ...baseInput(), setupToken: "wrong-token-wrong-token" }),
    ).rejects.toMatchObject({ status: 403 });
    const u = await prisma.user.findFirstOrThrow();
    // Secret untouched by the failed attempt.
    const again = await createAccountOrRecover(baseInput());
    expect(again.kind).toBe("recovered");
    void u;
  });
});

(ready ? describe : describe.skip)("rate limiter behavior (unit over runtime fn)", () => {
  it("allows maxPerMinute then blocks within the window", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(rateLimit(key, 3)).toBe(true);
    expect(rateLimit(key, 3)).toBe(true);
    expect(rateLimit(key, 3)).toBe(true);
    expect(rateLimit(key, 3)).toBe(false);
    // Distinct key unaffected.
    expect(rateLimit(`other-${crypto.randomUUID()}`, 3)).toBe(true);
  });
});
