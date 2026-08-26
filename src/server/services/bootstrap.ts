import { prisma } from "../db";
import { ApiError, audit } from "../api";
import { constantTimeEqual } from "../auth/password";
import { encryptSecret, generateTotpSecret, totpUri } from "../auth/totp";
import { uuidv7 } from "../ids";
import { ENV } from "../env";
import { seedDefaults } from "./seedImpl";

export interface BootstrapResult {
  kind: "created" | "recovered";
  email: string;
  totpSecret: string;
  otpauthUri: string;
}

/**
 * C5 remediation: single entry point for first-run setup AND pre-confirmation
 * secret recovery.
 *
 * States:
 *   no account              -> create (+seed defaults)
 *   account, TOTP pending   -> RECOVER: regenerate secret; old one invalidated
 *   account, TOTP confirmed -> refuse (409 already_bootstrapped), never re-enter
 *
 * The setup token gates every path. Secrets are only ever returned while
 * confirmation is pending.
 */
export async function createAccountOrRecover(input: {
  setupToken: string;
  email: string;
  passwordHash: string;
  timezone: string;
}): Promise<BootstrapResult> {
  if (!constantTimeEqual(input.setupToken, ENV.SETUP_TOKEN)) {
    throw new ApiError(403, "bad_setup_token", "Invalid setup token");
  }

  const user = await prisma.user.findFirst();
  const email = input.email.toLowerCase();
  const secret = generateTotpSecret();

  if (!user) {
    const created = await prisma.user.create({
      data: {
        id: uuidv7(),
        email,
        passwordHash: input.passwordHash,
        totpSecretEnc: encryptSecret(secret),
        timezone: input.timezone,
      },
    });
    await audit(created.id, "create", "user", created.id);
    await seedDefaults(created.id);
    return { kind: "created", email, totpSecret: secret, otpauthUri: totpUri(email, secret) };
  }

  if (user.totpConfirmed) {
    throw new ApiError(409, "already_bootstrapped", "Account already exists");
  }

  // Pre-confirmation recovery: regenerate atomically; previous secret dies here.
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: encryptSecret(secret) },
  });
  await audit(user.id, "recover", "totp_secret", user.id);
  return { kind: "recovered", email: user.email, totpSecret: secret, otpauthUri: totpUri(user.email, secret) };
}
