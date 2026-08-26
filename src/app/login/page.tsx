"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      if (!needTotp) {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
        });
        const body = (await res.json()) as { error?: { message?: string; code?: string }; needTotp?: boolean };
        if (res.status === 409 && body.error?.code === "finish_setup") {
          router.push("/bootstrap");
          return;
        }
        if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        setNeedTotp(true);
      } else {
        const res = await fetch("/api/auth/totp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: f.get("code") }),
        });
        const body = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        router.push("/today");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="panel rounded-lg w-full max-w-sm p-6">
        <h1 className="text-base font-semibold">
          POS<span style={{ color: "var(--accent)" }}> ·</span> sign in
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Private instance. Password + authenticator.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          {!needTotp ? (
            <>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" className="input" required autoComplete="username" autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
              </div>
            </>
          ) : (
            <div>
              <label className="label" htmlFor="code">Authenticator code</label>
              <input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6}
                className="input num text-center text-lg tracking-widest" placeholder="000000" required autoFocus />
            </div>
          )}
          <button className="btn btn-accent w-full justify-center" disabled={busy}>
            {needTotp ? "Verify" : "Continue"}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-xs px-2 py-1.5 rounded" style={{ color: "var(--bad)", background: "color-mix(in srgb, var(--bad) 12%, transparent)" }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
