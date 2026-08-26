"use client";

import Link from "next/link";
import { useToday, useCheckin, useTaskMutations } from "@/lib/client/hooks";
import { CaptureBar } from "@/components/CaptureBar";
import { MetricTile } from "@/components/MetricTile";
import { PlanVsActual } from "@/components/PlanVsActual";

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
