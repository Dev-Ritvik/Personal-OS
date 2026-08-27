"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import Link from "next/link";

export default function TrajectoryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["trajectory"],
    queryFn: () => api<{ data: any }>("/api/personal/trajectory").then((r) => r.data),
  });

  if (isLoading) return <div className="panel rounded p-4 h-32 animate-pulse" />;
  if (error || !data) return <p className="panel rounded p-4 text-sm" style={{ color: "var(--bad)" }}>Failed: {String(error)}</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Trajectory</h1>
        <p className="text-2xs num" style={{ color: "var(--faint)" }}>Today {data.now} · NOW → Nov 2027 lifestyle → Masters → Settlement. No forecast AI — only schedules and gaps.</p>
      </header>

      {data.bottlenecks.length > 0 && (
        <section className="panel rounded p-3" style={{ background: "var(--panel-2)" }}>
          <div className="text-2xs uppercase tracking-wider" style={{ color: "var(--warn)" }}>Bottlenecks — strict</div>
          <ul className="list-disc list-inside text-2xs mt-1" style={{ color: "var(--muted)" }}>
            {data.bottlenecks.map((b: string, i: number) => <li key={i}>{b}</li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-4">
        {(
          [
            ["now_nov2026", "NOW → Nov 2026 — QHR delivery"],
            ["nov2026_early2027", "Nov 2026 → Early 2027"],
            ["early2027_sep2027", "Early 2027 → Sep 2027 POLAND"],
            ["sep2027_nov2027", "Sep 2027 → Nov 2027 lifestyle"],
            ["post_btech", "POST-BTECH Master's (NL/DE/CH) → NO/NL settlement"],
          ] as const
        ).map(([key, label]) => (
          <section key={key} className="panel rounded p-3">
            <h2 className="text-xs font-medium">{label}</h2>
            <div className="text-2xs num mb-2" style={{ color: "var(--faint)" }}>{(data.byPhase as any)[key]?.length ?? 0} milestones</div>
            {(data.byPhase as any)[key]?.length === 0 ? (
              <p className="text-2xs" style={{ color: "var(--faint)" }}>No milestones in this phase — add goals with target dates.</p>
            ) : (
              <ul className="space-y-1.5">
                {(data.byPhase as any)[key].map((m: any) => (
                  <li key={m.label} className="flex items-start justify-between gap-2 border rounded px-2 py-1.5" style={{ borderColor: "var(--line)" }}>
                    <div className="min-w-0">
                      <div className="text-xs truncate">{m.label}</div>
                      <div className="text-2xs num" style={{ color: "var(--faint)" }}>{m.date} · {m.evidence}</div>
                    </div>
                    <span className={`chip text-2xs shrink-0 ${m.status === "blocked" ? "chip-metric" : m.status === "at_risk" ? "chip-inference" : m.status === "done" ? "" : ""}`} style={m.status === "done" ? { color: "var(--good)" } : undefined}>
                      {m.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="panel rounded p-3">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>All milestones — sorted</h2>
        <ul className="space-y-1">
          {data.milestones.map((m: any) => (
            <li key={m.label + m.date} className="flex justify-between text-2xs num" style={{ color: "var(--muted)" }}>
              <span className="truncate mr-2 text-xs" style={{ color: "var(--text)" }}>{m.label}</span>
              <span className="shrink-0">{m.date} · {m.kind} · {m.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="text-2xs" style={{ color: "var(--faint)" }}>
        <Link href="/goals" className="hover:underline">→ Goals</Link> · <Link href="/readiness" className="hover:underline">→ Readiness</Link> · <Link href="/today" className="hover:underline">→ Today</Link>
      </div>
    </div>
  );
}
