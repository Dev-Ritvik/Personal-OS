"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

export default function ProfilePage() {
  const profile = useQuery({
    queryKey: ["personal-profile"],
    queryFn: () => api<{ data: any }>("/api/personal/profile").then((r) => r.data),
  });
  const current = useQuery({
    queryKey: ["state-current"],
    queryFn: () => api<{ data: any[] }>("/api/personal/state?kind=CURRENT").then((r) => r.data),
  });
  const target = useQuery({
    queryKey: ["state-target"],
    queryFn: () => api<{ data: any[] }>("/api/personal/state?kind=TARGET").then((r) => r.data),
  });

  if (profile.isLoading) return <div className="panel rounded h-40 animate-pulse" />;

  const p = profile.data as any;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-lg font-semibold">Personal Model</h1>

      {/* Identity */}
      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--faint)" }}>Identity & Context</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span style={{ color: "var(--faint)" }}>Name:</span> {p?.displayName ?? "—"}</div>
          <div><span style={{ color: "var(--faint)" }}>Location:</span> {p?.location ?? "—"}</div>
          <div><span style={{ color: "var(--faint)" }}>Education:</span> {p?.education ?? "—"}</div>
          <div><span style={{ color: "var(--faint)" }}>Year:</span> {p?.academicYear ?? "—"}</div>
          <div><span style={{ color: "var(--faint)" }}>CGPA:</span> {p?.currentCgpa ?? "—"} → {p?.targetCgpa ?? "—"}</div>
          <div><span style={{ color: "var(--faint)" }}>Work window:</span> {p?.bestWorkWindow ?? "—"} / {p?.worstWorkWindow ?? "—"}</div>
        </div>
        {p?.sleepInconsistency !== null && p?.sleepInconsistency !== undefined && (
          <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Sleep inconsistency: <span className="num">{p.sleepInconsistency}/10</span>
            {p.sleepInconsistency >= 7 && <span className="chip chip-insufficient ml-2">high — evidence suggests routine instability</span>}
          </div>
        )}
      </section>

      {/* Current vs Target — structurally distinct (AC-PM1) */}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="panel rounded p-4">
          <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>Current State — FACT</h2>
          <p className="text-2xs mb-3" style={{ color: "var(--faint)" }}>Observed or user-reported. Not aspirational.</p>
          <ul className="space-y-1.5">
            {(current.data ?? []).map((s: any) => (
              <li key={s.id} className="flex gap-2 text-xs">
                <span className="chip chip-metric text-2xs">{s.domain}</span>
                <span className="flex-1"><span className="font-medium">{s.label}:</span> {s.value}</span>
              </li>
            ))}
            {(current.data ?? []).length === 0 && <li className="text-2xs" style={{ color: "var(--faint)" }}>No current-state items yet.</li>}
          </ul>
        </section>

        <section className="panel rounded p-4" style={{ borderColor: "var(--accent)", borderStyle: "dashed" }}>
          <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--warn)" }}>Target State — ASPIRATION</h2>
          <p className="text-2xs mb-3" style={{ color: "var(--faint)" }}>Intended trajectory. Not current fact. Distinguished by dashed border.</p>
          <ul className="space-y-1.5">
            {(target.data ?? []).map((s: any) => (
              <li key={s.id} className="flex gap-2 text-xs">
                <span className="chip text-2xs" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>{s.domain}</span>
                <span className="flex-1"><span className="font-medium">{s.label}:</span> {s.value}</span>
              </li>
            ))}
            {(target.data ?? []).length === 0 && <li className="text-2xs" style={{ color: "var(--faint)" }}>No target-state items yet.</li>}
          </ul>
        </section>
      </div>

      {/* Tracking importance */}
      {p?.preferences?.trackingImportance && (
        <section className="panel rounded p-4">
          <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Tracking Importance (user stated need)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
            {Object.entries(p.preferences.trackingImportance as Record<string, number>).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="flex-1 capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                <span className={`chip ${v === 3 ? "chip-metric" : v === 2 ? "" : "chip-insufficient"}`}>{v}</span>
              </div>
            ))}
          </div>
          <p className="text-2xs mt-2" style={{ color: "var(--faint)" }}>3 = absolutely need. This is tracking need, not a moral ranking.</p>
        </section>
      )}
    </div>
  );
}
