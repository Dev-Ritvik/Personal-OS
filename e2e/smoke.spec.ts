import { expect, test } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { readFileSync } from "node:fs";

/**
 * Critical-loop E2E: bootstrap → dashboard → quick-log time.
 * Requires a fresh DB (scripts/reset-db.sh) and setup-token.txt present.
 */
const SETUP_TOKEN = () => readFileSync("setup-token.txt", "utf8").trim();

test("bootstrap, land on Today, quick-log time", async ({ page }) => {
  await page.goto("/bootstrap");
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __POS_HYDRATED?: boolean }).__POS_HYDRATED),
  );

  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/bootstrap") && r.request().method() === "POST",
  );

  await page.fill("#setupToken", SETUP_TOKEN());
  await page.fill("#email", `e2e-${Date.now()}@local.test`);
  await page.fill("#password", "correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  const resp = await respPromise;
  expect(resp.status(), await resp.text()).toBe(200);

  // Wait for step-2 render, then confirm TOTP
  const secretText = await page.locator("code").first().textContent();
  expect(secretText).toBeTruthy();
  const totp = new TOTP({
    secret: Secret.fromBase32(secretText!.trim()),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  await page.fill('input[name="code"]', totp.generate());

  const confirmPromise = page.waitForResponse((r) =>
    r.url().includes("/api/bootstrap/confirm"),
  );
  await page.getByRole("button", { name: "Confirm" }).click();
  const confirmResp = await confirmPromise;
  expect(confirmResp.status()).toBe(200);

  await page.waitForURL("**/today");
  await expect(page.getByRole("heading", { name: /Today/ })).toBeVisible();

  // Quick-log 25 minutes
  await page.getByLabel("Duration minutes").fill("25");
  await page.getByLabel("Note").fill("e2e focus block");
  await page.getByRole("button", { name: "Log time" }).click();

  await expect(page.locator("main")).not.toContainText("Failed to load today");
});
