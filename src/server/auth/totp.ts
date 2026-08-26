import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { ENV } from "../env";

/**
 * TOTP (RFC 6238) enrollment/verification + AES-256-GCM encryption of the
 * shared secret at rest (`totp_secret_enc`, ARCHITECTURE.md §13/§15).
 */

function aesKey(): Buffer {
  return Buffer.from(ENV.APP_SECRET, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptSecret(enc: string): string {
  const [version, ivB64, tagB64, ctB64] = enc.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    aesKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(email: string, secretBase32: string): string {
  return new TOTP({
    issuer: "POS",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  }).toString();
}

/** Verify a 6-digit code with ±1 step drift tolerance. */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const totp = new TOTP({
    issuer: "POS",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.validate({ token: clean, window: 1 }) !== null;
}
