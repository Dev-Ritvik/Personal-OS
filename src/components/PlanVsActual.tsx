"use client";

import type { TodayPayload } from "@/lib/client/hooks";
import { minutes, pct } from "./MetricTile";

/** Plan-vs-actual bar split by value class (§5.2). Honest y-axis: waking budget. */
export function PlanVsActual({ tb }: { tb: TodayPayload["timeBudget"] }) {
  const classes = [
    { key: "productive", label: "Productive", color: "var(--accent)" },
    { key: "maintenance", label: "Maintenance", color: "var(--muted)" },
    { key: "intentional_leisure", label: "Leisure (intentional)", color: "var(--ok)" },
    { key: "unproductive", label: "Unproductive (your label)", color: "var(--bad)" },
    { key: "neutral", label: "Neutral", color: "var(--faint)" },
  ];
  const waking = tb.wakingMinutes ?? 0;
  const total = Math.max(tb.totalCategorizedMinutes, tb.plannedMinutes ?? 0, 1);

  if (waking === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--faint)" }}>
        Set waking hours in Settings to enable the daily budget view.
      </p>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${Math.max(waking, total)} 26`} preserveAspectRatio="none" className="w-full h-7 rounded overflow-hidden" style={{ background: "var(--panel-2)" }} role="img" aria-label="Time allocation bar">
        {(() => {
          let x = 0;
          return classes.map((c) => {
            const v = tb.categorizedByClass[c.key] ?? 0;
            if (v <= 0) return null;
            const rect = (
              <rect key={c.key} x={x} y={0} width={v} height={26} fill={c.color} opacity={0.75} />
            );
            x += v;
            return rect;
          });
        })()}
        {tb.plannedMinutes !== null && (
          <line
            x1={tb.plannedMinutes} x2={tb.plannedMinutes} y1={0} y2={26}
            stroke="var(--ink)" strokeDasharray="3 3" strokeWidth={1.5}
          />
        )}
      </svg>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-2xs" style={{ color: "var(--muted)" }}>
        {classes.map((c) => (
          <div key={c.key} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.color, opacity: 0.75 }} />
            <span>{c.label}</span>
            <span className="num ml-auto">{minutes((tb.categorizedByClass[c.key] ?? 0))}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 col-span-2 sm:col-span-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed" style={{ borderColor: "var(--ink)" }} />
          <span>Planned</span>
          <span className="num ml-auto">{minutes(tb.plannedMinutes)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: "var(--faint)" }}>Executed vs plan:</span>
          <span className="num">{minutes(tb.executedPlannedMinutes)}</span>
          <span>
            {tb.plannedMinutes && tb.plannedMinutes > 0 && tb.executedPlannedMinutes !== null
              ? `(${pct(tb.executedPlannedMinutes / tb.plannedMinutes)})`
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
