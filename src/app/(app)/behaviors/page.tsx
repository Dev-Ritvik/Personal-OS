"use client";

import { useState } from "react";
import { useBehaviors, useCategories, useBehaviorCreate, useCheckin, useToday } from "@/lib/client/hooks";

export default function BehaviorsPage() {
  const behaviors = useBehaviors();
  const categories = useCategories();
  const create = useBehaviorCreate();
  const today = useToday();
  const checkin = useCheckin();

  const [title, setTitle] = useState("");
  const [schedType, setSchedType] = useState<"daily" | "weekly">("daily");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [catId, setCatId] = useState("");
  const [perDay, setPerDay] = useState("");
  const [unit, setUnit] = useState("times");

  const instanceByBehavior = new Map<string, { instanceId: string; met: boolean | null; doneAt: string | null }>();
  for (const b of today.data?.focus.behaviors ?? []) {
    instanceByBehavior.set(b.behaviorId, { instanceId: b.instanceId, met: b.met, doneAt: b.doneAt });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const schedule =
      schedType === "daily" ? { type: "daily" } : { type: "weekly", days };
    const perDayNum = perDay ? parseFloat(perDay) : null;
    await create.mutateAsync({
      title,
      categoryId: catId || null,
      schedule,
      target: {
        unit: unit || "times",
        aggregation: unit.toLowerCase().includes("min") ? "minutes" : "count",
        perDay: perDayNum,
      },
    });
    setTitle(""); setPerDay("");
    void behaviors.refetch();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Behaviors</h1>

      <form onSubmit={add} className="panel rounded p-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="sm:col-span-2">
            <span className="label">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Read 20 pages" />
          </label>
          <label>
            <span className="label">Schedule</span>
            <select className="input" value={schedType} onChange={(e) => setSchedType(e.target.value as "daily" | "weekly")}>
              <option value="daily">Every day</option>
              <option value="weekly">Specific weekdays</option>
            </select>
          </label>
          <label>
            <span className="label">Category</span>
            <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">—</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        {schedType === "weekly" && (
          <div className="flex gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => {
              const day = i + 1;
              const active = days.includes(day);
              return (
                <button
                  key={d}
                  type="button"
                  className="btn"
                  style={active ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
                  onClick={() => setDays(active ? days.filter((x) => x !== day) : [...days, day])}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <label className="w-24">
            <span className="label">Daily target</span>
            <input className="input num" value={perDay} onChange={(e) => setPerDay(e.target.value)} placeholder="1" inputMode="decimal" />
          </label>
          <label className="w-28">
            <span className="label">Unit</span>
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="times / minutes" />
          </label>
          <button className="btn btn-accent" disabled={create.isPending}>Define behavior</button>
          <span className="text-2xs self-center" style={{ color: "var(--faint)" }}>
            times-per-week schedules ship in P1 (ad-hoc check-ins count toward them already).
          </span>
        </div>
      </form>

      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--faint)" }}>
          Definitions
        </h2>
        {behaviors.isLoading ? (
          <div className="h-16 animate-pulse rounded" style={{ background: "var(--panel-2)" }} />
        ) : (behaviors.data?.length ?? 0) === 0 ? (
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            None defined. Behaviors generate daily plan instances automatically.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {behaviors.data!.map((b) => {
              const inst = instanceByBehavior.get(b.id);
              const schedLabel =
                b.schedule.type === "daily"
                  ? "every day"
                  : b.schedule.type === "weekly"
                    ? (b.schedule.days ?? []).map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]).join(" ")
                    : `${b.schedule.n}×/week`;
              return (
                <li key={b.id} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{b.title}</div>
                    <div className="num text-2xs" style={{ color: "var(--faint)" }}>
                      {schedLabel}
                      {b.target.perDay ? ` · ${b.target.perDay} ${b.target.unit}` : ""} ·{" "}
                      {b.status}
                    </div>
                  </div>
                  {inst ? (
                    <button
                      className={`btn ${inst.doneAt ? "" : "btn-accent"}`}
                      disabled={checkin.isPending || !!inst.doneAt}
                      onClick={() =>
                        checkin.mutate({
                          instanceId: inst.instanceId,
                          actualQty: b.target.perDay ?? 1,
                        })
                      }
                    >
                      {inst.doneAt ? `✓${inst.met === false ? " (below target)" : ""}` : "Check in"}
                    </button>
                  ) : (
                    <span className="chip chip-insufficient">not scheduled today</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-2xs" style={{ color: "var(--faint)" }}>
        Consistency is measured by 30-day adherence and rolling compliance — not streak counters. A missed day is data;
        it is not punishment.
      </p>
    </div>
  );
}
