"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deviceTimezone } from "@/lib/client/api";

export default function BootstrapPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "totp">("form");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          setupToken: f.get("setupToken"),
          email: f.get("email"),
          password: f.get("password"),
          timezone: deviceTimezone(),
        }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        totpSecret?: string;
        otpauthUri?: string;
      };
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      setSecret(body.totpSecret!);
      setOtpauthUri(body.otpauthUri!);
      setStep("totp");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/bootstrap/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: f.get("code") }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      router.push("/today");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="panel rounded-lg w-full max-w-md p-6">
        <h1 className="text-base font-semibold">First-run setup</h1>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          One account. One-time setup token from your environment.
        </p>

        {step === "form" ? (
          <form onSubmit={submitForm} className="mt-5 space-y-3">
            <div>
              <label className="label" htmlFor="setupToken">Setup token</label>
              <input id="setupToken" name="setupToken" className="input num text-xs" required autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="input" required autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password (10+ chars)</label>
              <input id="password" name="password" type="password" minLength={10} className="input" required autoComplete="new-password" />
            </div>
            <button className="btn btn-accent w-full justify-center" disabled={busy}>
              Create account
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-3">
            <div>
              <span className="label">Authenticator secret</span>
              <code className="num block break-all rounded p-2 text-xs" style={{ background: "var(--bg)" }}>
                {secret}
              </code>
              <a href={otpauthUri} className="text-2xs underline mt-1 inline-block" style={{ color: "var(--accent)" }} download>
                otpauth:// URI
              </a>
            </div>
            <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: "var(--muted)" }}>
              <li>Add the secret to your authenticator app.</li>
              <li>Enter the current 6-digit code to confirm and log in.</li>
            </ol>
            <form onSubmit={submitCode} className="flex gap-2">
              <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} className="input num text-center" placeholder="000000" required autoFocus />
              <button className="btn btn-accent" disabled={busy}>Confirm</button>
            </form>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs px-2 py-1.5 rounded" style={{ color: "var(--bad)", background: "color-mix(in srgb, var(--bad) 12%, transparent)" }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
