"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

const STATUS_COLOR: Record<string, string> = {
  UNKNOWN: "var(--faint)",
  FOUNDATIONAL: "#8a9a5b",
  DEVELOPING: "var(--accent)",
  READY: "var(--ok)",
  BLOCKED: "var(--bad)",
};

export default function ReadinessPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["readiness"],
    queryFn: () => api<{ data: any[] }>("/api/readiness").then((r) => r.data),
  });

  if (isLoading) return <div className="panel rounded h-40 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Poland Readiness</h1>
        <p className="text-2xs mt-1" style={{ color: "var(--muted)" }}>
          Not a gamified percentage. Each dimension shows current evidence, missing requirements, and next action.
          Computed from skills, goals, and explicit requirements — never invented.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((dim: any) => (
          <div key={dim.key} className="panel rounded p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{dim.label}</h2>
              <span className="chip text-2xs" style={{ borderColor: STATUS_COLOR[dim.status] ?? "var(--line)", color: STATUS_COLOR[dim.status] ?? "var(--faint)" }}>
                {dim.status}
              </span>
            </div>
            {dim.description && <p className="text-2xs mt-1" style={{ color: "var(--muted)" }}>{dim.description}</p>}

            <div className="mt-3">
              <div className="num text-2xs" style={{ color: "var(--faint)" }}>
                {dim.met}/{dim.total} requirements met
              </div>
              <div className="h-1.5 rounded mt-1 overflow-hidden" style={{ background: "var(--panel-2)" }}>
                <div className="h-full" style={{ width: `${dim.total ? (dim.met / dim.total) * 100 : 0}%`, background: STATUS_COLOR[dim.status] ?? "var(--faint)" }} />
              </div>
            </div>

            {dim.missing?.length > 0 && (
              <div className="mt-3">
                <span className="text-2xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Missing</span>
                <ul className="mt-1 space-y-0.5">
                  {dim.missing.map((m: string, i: number) => (
                    <li key={i} className="text-2xs" style={{ color: "var(--muted)" }}>• {m}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
              <span className="text-2xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Next action</span>
              <p className="text-xs mt-0.5">{dim.nextAction}</p>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <p className="text-xs col-span-2" style={{ color: "var(--faint)" }}>No readiness dimensions seeded. Run the personal-model seed.</p>
        )}
      </div>
    </div>
  );
}
