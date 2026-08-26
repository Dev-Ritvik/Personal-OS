"use client";

import { useState } from "react";
import { useAnalytics } from "@/lib/client/hooks";
import { MetricTile, pct } from "@/components/MetricTile";
import type { MetricResultDto } from "@/lib/client/hooks";

/** Analytics v1 — gated tables first (buffer policy §18); bars enhance. */
export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useAnalytics(days);

  if (isLoading) return <div className="panel rounded h-40 animate-pulse" />;
  if (error || !data)
    return (
      <p className="panel rounded p-4 text-sm" style={{ color: "var(--bad)" }}>
        Failed to load analytics.
      </p>
    );

  const m = data.metrics as Record<string, MetricResultDto>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <select className="input w-32 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 60, 90].map((d) => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
      </div>

      <p className="text-2xs" style={{ color: "var(--faint)" }}>
        Every figure below states its formula and data sufficiency on tap. Correlation views (P1) will carry explicit
        non-causal framing — association in your logs is not causation.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile result={m.m1_execution_rate} suffix="today" digits={0} />
        <MetricTile result={m.m2_consistency} suffix="consistency 30d" digits={0} />
        <MetricTile result={m.m10_schedule_reliability} suffix="reliability 14d" digits={0} />
        <MetricTile
          result={
            m.m3_plan_actual_variance?.status === "ok"
              ? {
                  ...m.m3_plan_actual_variance,
                  value: Math.round((m.m3_plan_actual_variance.value as unknown as { minutes: number }).minutes),
                }
              : m.m3_plan_actual_variance
          }
          suffix="min variance 14d"
          digits={0}
        />
        <MetricTile result={m.m8_overplanning_ratio} suffix="× overplanning" />
        <MetricTile result={m.m9_under_execution} suffix="under-executed" digits={0} />
      </div>

      {/* Daily series — honest bars from zero */}
      <section className="panel rounded p-4 overflow-x-auto">
        <h2 className="text-2xs uppercase tracking-wider mb-3" style={{ color: "var(--faint)" }}>
          Daily productive minutes (bars) · execution rate (dots, where obligations existed)
        </h2>
        <svg viewBox={`0 0 ${data.series.length * 14} 120`} className="w-full h-32 min-w-[560px]" preserveAspectRatio="none" role="img" aria-label="Daily series">
          {(() => {
            const maxMin = Math.max(...data.series.map((s) => s.productiveMinutes), 60);
            return data.series.map((s, i) => {
              const h = (s.productiveMinutes / maxMin) * 100;
              return (
                <g key={s.date}>
                  <rect x={i * 14 + 2} y={110 - h} width={10} height={h} fill="var(--accent)" opacity={0.55} />
                  {s.executionRate !== null && s.behaviorScheduled !== null && (
                    <circle cx={i * 14 + 7} cy={110 - s.executionRate * 100} r={2} fill="var(--ink)" opacity={0.8} />
                  )}
                </g>
              );
            });
          })()}
          <line x1={0} x2={data.series.length * 14} y1={110} y2={110} stroke="var(--line)" />
        </svg>
      </section>

      {/* Gated table — the numbers behind the picture */}
      <details className="panel rounded p-4">
        <summary className="text-xs cursor-pointer">Daily table ({data.series.length} days)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-2xs num">
            <thead style={{ color: "var(--faint)" }}>
              <tr className="text-left">
                <th className="py-1 pr-2">date</th>
                <th className="pr-2">planned</th>
                <th className="pr-2">exec-planned</th>
                <th className="pr-2">productive</th>
                <th className="pr-2">unknown%</th>
                <th className="pr-2">rate</th>
                <th>due</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--muted)" }}>
              {[...data.series].reverse().map((s) => (
                <tr key={s.date} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="py-0.5 pr-2">{s.date.slice(5)}</td>
                  <td className="pr-2">{s.plannedMinutes ?? "—"}</td>
                  <td className="pr-2">{s.executedPlannedMinutes ?? "—"}</td>
                  <td className="pr-2">{Math.round(s.productiveMinutes)}</td>
                  <td className="pr-2">{s.unknownShare === null ? "—" : pct(s.unknownShare)}</td>
                  <td className="pr-2">{s.executionRate === null ? "—" : pct(s.executionRate)}</td>
                  <td>{s.tasksDue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
