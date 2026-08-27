"use client";

import Link from "next/link";
import { useToday, useCheckin, useTaskMutations } from "@/lib/client/hooks";
import { CaptureBar } from "@/components/CaptureBar";
import { MetricTile } from "@/components/MetricTile";
import { PlanVsActual } from "@/components/PlanVsActual";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

/**
 * Today — mandated question coverage (ARCHITECTURE.md §5.2):
 * what matters now · scheduled/due · logging state · plan vs actual ·
 * what is slipping (evidence-backed flags) · degraded-confidence badge.
 */
export default function TodayPage() {
  const { data, isLoading, error } = useToday();
  const checkin = useCheckin();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel rounded h-24 animate-pulse" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="panel rounded p-4 text-sm" style={{ color: "var(--bad)" }}>
        Failed to load today: {String(error)}
      </p>
    );
  }

  const m = data.metrics;

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">
          Today{" "}
          <span className="num text-sm font-normal" style={{ color: "var(--faint)" }}>
            {data.today} · {data.timezone}
          </span>
        </h1>
        {m.degradedConfidence && (
          <span className="chip chip-insufficient" title="Unknown-time share above 60% for the last 5 days — treat all insights as low confidence.">
            low confidence
          </span>
        )}
      </header>

      {/* What's slipping — evidence-first flag row (§9.2) */}
      {data.flags.length > 0 && (
        <section aria-label="Signals">
          <div className="flex flex-wrap gap-2">
            {data.flags.map((f) => (
              <Link
                key={f.key}
                href="/analytics"
                className={`chip ${f.severity === "warning" ? "chip-inference" : "chip-metric"}`}
                title={Object.entries(f.evidence)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              >
                {f.severity === "warning" ? "▲ " : ""}
                {f.message}
              </Link>
            ))}
          </div>
        </section>
      )}

      <CaptureBar />

      <EnhancedCommandBrief />

      <CommandBrief />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Focus list */}
        <section className="panel rounded p-4 lg:col-span-2 space-y-4">
          <div>
            <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>
              Scheduled behaviors
            </h2>
            {data.focus.behaviors.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--faint)" }}>
                Nothing scheduled. Define behaviors to generate daily plans.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                {data.focus.behaviors.map((b) => (
                  <li key={b.instanceId} className="py-2 flex items-center gap-3">
                    <button
                      className="btn btn-accent"
                      disabled={checkin.isPending}
                      onClick={() =>
                        checkin.mutate({
                          instanceId: b.instanceId,
                          actualQty: b.plannedQty ?? 1,
                        })
                      }
                    >
                      {b.doneAt ? "✓ done" : "Check in"}
                    </button>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{b.label}</div>
                      <div className="num text-2xs" style={{ color: "var(--faint)" }}>
                        target {b.plannedQty ?? 1}
                        {b.actualQty !== null ? ` · logged ${b.actualQty}` : ""}
                        {b.met === true ? " · met" : b.met === false ? " · below target" : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <TaskList title="Due today" tasks={data.focus.tasksDueToday} empty="No tasks due." />
            <TaskList
              title={
                <>
                  Overdue{" "}
                  <span className="num" style={{ color: "var(--bad)" }}>
                    {data.focus.overdue.length}
                  </span>
                </>
              }
              tasks={data.focus.overdue}
              empty="Nothing overdue."
            />
          </div>
        </section>

        {/* Metrics column */}
        <aside className="space-y-3">
          <PlanVsActual tb={data.timeBudget} />
          <div className="grid grid-cols-2 gap-2">
            <MetricTile result={m.executionRateToday} suffix="of scheduled" digits={0} />
            <MetricTile result={m.unknownTimeShareToday} suffix="unknown" digits={0} />
            <MetricTile result={m.consistency30d} suffix="30d consistency" digits={0} />
            <MetricTile result={m.overplanningRatio} suffix="× baseline planned" />
            <MetricTile
              result={
                m.variance14d.status === "ok"
                  ? {
                      status: "ok",
                      value: Math.round(m.variance14d.value!.minutes),
                      gates: m.variance14d.gates,
                      meta: m.variance14d.meta,
                    }
                  : m.variance14d
              }
              suffix="min variance 14d"
              digits={0}
            />
            <MetricTile result={m.underExecution14d} suffix="under-executed 14d" digits={0} />
            <MetricTile
              result={
                m.postponement.status === "ok"
                  ? {
                      status: "ok",
                      value: m.postponement.value!.chronicCount,
                      gates: m.postponement.gates,
                      meta: m.postponement.meta,
                    }
                  : m.postponement
              }
              suffix="chronic deferrals"
              digits={0}
            />
          </div>

          {/* AC15: goal pace renders through the same provenance pipeline as
              every other metric — formula, gates, epistemic class. */}
          {data.goalPace.length > 0 && (
            <div className="grid grid-cols-1 gap-2">
              {data.goalPace.map((g) => (
                <div key={g.goalId}>
                  <MetricTile result={g.result} digits={2} />
                  <p className="num text-2xs mt-0.5 px-1" style={{ color: "var(--muted)" }}>
                    need {g.requiredVelocityPerDay.toFixed(2)}/day · doing{" "}
                    {g.observedVelocityPerDay.toFixed(2)}/day
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function CommandBrief() {
  const { data, isLoading } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => api<{ data: any[] }>("/api/personal/recommendations").then((r) => r.data),
  });

  if (isLoading) return <div className="panel rounded p-3 h-16 animate-pulse" />;
  if (!data || data.length === 0) return null;

  return (
    <section className="panel rounded p-4 border-l-2" style={{ borderLeftColor: "var(--accent)" }}>
      <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>
        Command Brief — What matters today (strict, ordered not scored, evidence carries reason)
      </h2>
      <ul className="space-y-2">
        {data.slice(0, 3).map((rec: any, i: number) => (
          <li key={i} className="border-t pt-2" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{rec.title}</span>
              <span className={`chip text-2xs ${rec.confidence === "HIGH" ? "chip-metric" : rec.confidence === "INSUFFICIENT" ? "chip-insufficient" : ""}`}>
                {rec.confidence}
              </span>
              <span className="chip text-2xs" style={{ color: "var(--faint)" }}>{rec.epistemic}</span>
            </div>
            <p className="text-2xs mt-1" style={{ color: "var(--muted)" }}>{rec.reason}</p>
            <p className="text-2xs" style={{ color: "var(--faint)" }}>Evidence: {Object.entries(rec.evidence).map(([k, v]) => `${k}=${v}`).join(" · ")}</p>
            <p className="text-2xs font-medium" style={{ color: "var(--accent)" }}>→ {rec.recommendedAction}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EnhancedCommandBrief() {
  const { data, isLoading } = useQuery({
    queryKey: ["command-brief"],
    queryFn: () => api<{ data: any }>("/api/personal/command").then((r) => r.data),
  });
  if (isLoading) return <div className="panel rounded p-4 h-28 animate-pulse" />;
  if (!data) return null;
  return (
    <section className="panel rounded p-4 space-y-3 border-l-2" style={{ borderLeftColor: "var(--accent)" }}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Morning Command — {data.today}</h2>
        <span className="text-2xs num" style={{ color: "var(--faint)" }}>{data.timezone}</span>
      </div>

      {/* Fixed commitments */}
      <div className="grid sm:grid-cols-3 gap-3 text-2xs">
        <div className="panel-2 rounded p-2">
          <div className="uppercase tracking-wider" style={{ color: "var(--faint)" }}>Fixed</div>
          <div className="text-xs font-medium mt-1">{data.fixedCommitment ? `${data.fixedCommitment.label}: ${data.fixedCommitment.window}` : "No fixed commitment — open day"}</div>
          <div className="num mt-0.5" style={{ color: "var(--muted)" }}>Best window: early morning · Sleep 22:00–07:00 (consistency 8/10)</div>
        </div>
        <div className="panel-2 rounded p-2">
          <div className="uppercase tracking-wider" style={{ color: "var(--faint)" }}>Capacity · <span className="normal-case" style={{ color: data.capacity.coldStart ? "var(--warn)" : "var(--faint)" }}>{data.capacity.coldStart ? "ASSUMPTION 90 min" : data.capacity.epistemic}</span></div>
          {data.capacity.status === "ok" ? (
            <>
              <div className="text-xs font-medium mt-1">Median {data.capacity.median} min · P25 {data.capacity.p25} · P75 {data.capacity.p75}</div>
              <div className="num mt-0.5" style={{ color: data.capacity.overplan.severity === "critical" ? "var(--bad)" : data.capacity.overplan.severity === "warning" ? "var(--warn)" : "var(--muted)" }}>
                Planned today: {data.capacity.plannedToday ?? "—"} min {data.capacity.overplan.ratio ? `· ${Math.round(data.capacity.overplan.ratio * 100) / 100}× median` : ""} {data.capacity.overplan.severity !== "ok" && data.capacity.overplan.severity !== "insufficient" ? `· ${data.capacity.overplan.severity}` : ""}
              </div>
              {data.loadVsCapacity && <div className="text-2xs num mt-0.5" style={{ color: data.loadVsCapacity.severity === "critical" ? "var(--bad)" : data.loadVsCapacity.severity === "warning" ? "var(--warn)" : "var(--muted)" }}>{data.loadVsCapacity.message}</div>}
            </>
          ) : (
            <>
              <div className="text-2xs mt-1" style={{ color: "var(--faint)" }}>Measured capacity not available yet — insufficient data. Gates: {data.capacity.gates?.filter((g:any)=>!g.passed).map((g:any)=>g.name).join(", ") || "—"}</div>
              <div className="text-2xs font-medium mt-1" style={{ color: "var(--warn)" }}>Temporary assumption: {data.capacity.assumedCapacity} min deep work (ASSUMPTION — not measured)</div>
              <div className="text-2xs num mt-0.5" style={{ color: "var(--muted)" }}>Once ≥5 productive days in 14d and ≥14 in 28d, assumption → observed capacity.</div>
              {data.loadVsCapacity && <div className="text-2xs num mt-1" style={{ color: "var(--muted)" }}>{data.loadVsCapacity.message}</div>}
            </>
          )}
        </div>
        <div className="panel-2 rounded p-2">
          <div className="uppercase tracking-wider" style={{ color: "var(--faint)" }}>Trajectory 90d</div>
          {data.trajectory.next90Days.length === 0 ? (
            <div className="text-2xs mt-1" style={{ color: "var(--faint)" }}>No dated milestones in next 90 days — add target dates to goals.</div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {data.trajectory.next90Days.map((m: any) => (
                <li key={m.label} className="flex justify-between">
                  <span className="truncate mr-2">{m.label}</span>
                  <span className={`chip text-2xs ${m.status === "blocked" ? "chip-metric" : m.status === "at_risk" ? "chip-inference" : ""}`}>{m.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Highest-value tasks with goal/skill mapping */}
      <div>
        <div className="text-2xs uppercase tracking-wider mb-1.5" style={{ color: "var(--faint)" }}>Highest-value today — priority by deadline, deferral, horizon, progress deficit, and Poland target-state relevance (ordered, not scored)</div>
        {data.prioritizedTasks.length === 0 ? (
          <p className="text-2xs" style={{ color: "var(--faint)" }}>No tasks due. Create tasks linked to goals to see prioritization.</p>
        ) : (
          <ul className="space-y-2">
            {data.prioritizedTasks.map((t: any) => (
              <li key={t.id} className="border rounded p-2" style={{ borderColor: t.isChronic ? "var(--warn)" : "var(--line)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium">#{t.rank} {t.title}</div>
                    <div className="text-2xs num" style={{ color: "var(--faint)" }}>
                      {t.urgency} · due {t.dueDate ?? "no date"} {t.deferredCount ? `· deferred ×${t.deferredCount}` : ""} {t.estimateMin ? `· est ${t.estimateMin} min` : ""}
                    </div>
                    {t.goal && (
                      <div className="text-2xs mt-1">
                        <span style={{ color: "var(--faint)" }}>Goal →</span> <Link href={`/goals/${t.goal.id}`} className="hover:underline">{t.goal.title}</Link>
                        <span className="num" style={{ color: "var(--muted)" }}> · {t.goal.horizon} {t.goal.targetDate ? `· due ${t.goal.targetDate}` : ""} {t.goal.progress01 !== null ? `· ${Math.round(t.goal.progress01 * 100)}%` : ""}</span>
                      </div>
                    )}
                    {t.skills.length > 0 && (
                      <div className="text-2xs" style={{ color: "var(--faint)" }}>Skills: {t.skills.map((s: any) => `${s.name} (${s.currentLevel})`).join(" · ")}</div>
                    )}
                  </div>
                  <span className="chip text-2xs shrink-0">{t.reason.slice(0, 48)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="text-2xs mt-1" style={{ color: "var(--faint)" }}>{data.allRankedCount} tasks ranked · <Link href="/work" className="hover:underline">Open Work</Link> to reprioritize</div>
      </div>

      {/* Risks */}
      {data.risks.length > 0 && (
        <div className="rounded p-2" style={{ background: "var(--panel-2)" }}>
          <div className="text-2xs uppercase tracking-wider" style={{ color: "var(--warn)" }}>Risks — strict, evidence-based</div>
          <ul className="list-disc list-inside text-2xs mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
            {data.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-2 text-2xs">
        <Link href="/trajectory" className="hover:underline" style={{ color: "var(--accent)" }}>→ Trajectory</Link>
        <Link href="/review" className="hover:underline" style={{ color: "var(--accent)" }}>→ Evening Review</Link>
        <Link href="/readiness" className="hover:underline" style={{ color: "var(--accent)" }}>→ Readiness gaps</Link>
      </div>
    </section>
  );
}

function TaskList({
  title,
  tasks,
  empty,
}: {
  title: React.ReactNode;
  tasks: Array<{ id: string; title: string; deferredCount: number; dueDate: string | null; estimateMin: number | null }>;
  empty: string;
}) {
  const { setStatus } = useTaskMutations();
  if (tasks.length === 0) {
    return (
      <div>
        <h3 className="text-2xs uppercase tracking-wider mb-1.5" style={{ color: "var(--faint)" }}>
          {title}
        </h3>
        <p className="text-xs" style={{ color: "var(--faint)" }}>{empty}</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-2xs uppercase tracking-wider mb-1.5" style={{ color: "var(--faint)" }}>
        {title}
      </h3>
      <ul className="space-y-1.5">
        {tasks.slice(0, 8).map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            <button
              aria-label={`Complete ${t.title}`}
              className="mt-0.5 w-3.5 h-3.5 rounded-sm border shrink-0"
              onClick={() => setStatus.mutate({ id: t.id, status: "done" })}
              style={{ borderColor: "var(--faint)" }}
            />
            <div className="min-w-0">
              <div className="text-xs leading-snug">{t.title}</div>
              <div className="num text-2xs" style={{ color: t.deferredCount >= 3 ? "var(--warn)" : "var(--faint)" }}>
                {t.dueDate ?? "no date"}
                {t.deferredCount > 0 ? ` · deferred ×${t.deferredCount}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
