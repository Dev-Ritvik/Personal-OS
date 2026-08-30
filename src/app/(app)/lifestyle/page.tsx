"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

export default function LifestylePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["lifestyle"],
    queryFn: () => api<{ data: any }>("/api/personal/lifestyle").then((r) => r.data),
  });

  if (isLoading) return <div className="panel rounded h-40 animate-pulse" />;
  if (!data) return null;

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold">Poland Lifestyle — CURRENT → TARGET</h1>
        <p className="text-2xs mt-1" style={{ color: "var(--muted)" }}>
          Measurable requirements from TargetStateRequirement + Behavior. Status: <span className="chip chip-insufficient">insufficient_data</span> until 28 days of observations, never fabricated.
        </p>
      </div>

      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--faint)" }}>Target Requirements → Observed</h2>
        <div className="space-y-2">
          {(data.gaps as any[]).map((g: any) => (
            <div key={g.requirement} className="border rounded p-2" style={{ borderColor: "var(--line)" }}>
              <div className="flex justify-between">
                <span className="text-xs font-medium">{g.requirement}</span>
                <span className={`chip text-2xs ${g.status === "at_risk" ? "chip-inference" : g.status === "insufficient_data" ? "chip-insufficient" : ""}`}>{g.status}</span>
              </div>
              <div className="text-2xs num mt-1" style={{ color: "var(--muted)" }}>
                Target: {g.target} · Observed: {g.observed}
              </div>
              <div className="text-2xs mt-1" style={{ color: "var(--faint)" }}>Evidence: {g.evidence}</div>
              <div className="text-2xs" style={{ color: "var(--faint)" }}>Dimension: {g.dimension} · Current: {g.currentState ?? "—"} → Target: {g.targetState ?? "—"}</div>
            </div>
          ))}
          {(data.gaps as any[]).length === 0 && <p className="text-2xs" style={{ color: "var(--faint)" }}>No TargetStateRequirements yet — re-run personal-model seed.</p>}
        </div>
      </section>

      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Behaviors for Lifestyle</h2>
        <ul className="space-y-1">
          {(data.behaviors as any[]).map((b: any) => (
            <li key={b.id} className="text-xs flex justify-between border-b py-1" style={{ borderColor: "var(--line)" }}>
              <span>{b.title}</span>
              <span className="text-2xs num" style={{ color: "var(--faint)" }}>{JSON.stringify(b.schedule)} → {JSON.stringify(b.target)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>State Items CURRENT vs TARGET</h2>
        <ul className="space-y-1">
          {(data.stateGaps as any[]).map((g: any) => (
            <li key={g.requirement} className="text-xs flex justify-between">
              <span>{g.requirement}: <span style={{ color: "var(--faint)" }}>{g.observed}</span> → {g.target}</span>
              <span className={`chip text-2xs ${g.status === "insufficient_data" ? "chip-insufficient" : ""}`}>{g.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
