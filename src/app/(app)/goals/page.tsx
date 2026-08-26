"use client";

import Link from "next/link";
import { useState } from "react";
import { useGoals } from "@/lib/client/hooks";

const HORIZON_BY_DEPTH = ["life", "annual", "quarterly", "quarterly"] as const;

export default function GoalsPage() {
  const goals = useGoals();
  const [showForm, setShowForm] = useState(false);

  if (goals.isLoading) return <div className="panel rounded h-40 animate-pulse" />;

  const all = goals.data ?? [];
  const roots = all.filter((g) => !g.parentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Goals</h1>
        <button className="btn btn-accent" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close" : "New goal"}
        </button>
      </div>

      {showForm && (
        <GoalForm
          all={all}
          onDone={() => {
            setShowForm(false);
            void goals.refetch();
          }}
        />
      )}

      {all.length === 0 && !showForm && (
        <p className="panel rounded p-6 text-sm" style={{ color: "var(--muted)" }}>
          No goals yet. Start with one life objective, then nest annual → quarterly → project/milestone beneath it
          (max depth 4).
        </p>
      )}

      <div className="space-y-3">
        {roots.map((g) => (
          <GoalNode key={g.id} goal={g} all={all} depth={0} />
        ))}
      </div>
    </div>
  );
}

interface GoalRow {
  id: string; parentId: string | null; title: string; horizon: string;
  kind: string; status: string; measureType: string; unit: string | null;
  targetValue: number | null; direction: string;
  startDate: string | null; targetDate: string | null;
}

function GoalNode({ goal, all, depth }: { goal: GoalRow; all: GoalRow[]; depth: number }) {
  const children = all.filter((g) => g.parentId === goal.id);
  const closed = ["achieved", "abandoned", "archived"].includes(goal.status);

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <Link
        href={`/goals/${goal.id}`}
        className="panel rounded px-3 py-2 flex items-center gap-2 hover:border-[var(--accent)] transition-colors"
      >
        <span className={`chip ${closed ? "chip-insufficient" : "chip-metric"}`}>
          {goal.kind}/{goal.horizon}
        </span>
        <span className="text-sm flex-1 truncate">{goal.title}</span>
        {goal.targetDate && (
          <span className="num text-2xs" style={{ color: "var(--faint)" }}>
            → {goal.targetDate}
          </span>
        )}
        <span className={`chip ${closed ? "chip-insufficient" : ""}`}>{goal.status}</span>
      </Link>
      <div className="mt-1.5 space-y-1.5">
        {children.map((c) => (
          <GoalNode key={c.id} goal={c} all={all} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

function GoalForm({ all, onDone }: { all: GoalRow[]; onDone: () => void }) {
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState("objective");
  const [measureType, setMeasureType] = useState("binary");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [direction, setDirection] = useState("at_least");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parent = all.find((g) => g.id === parentId);
  const depth = parent ? Math.min(4, ((): number => {
    let d = 1;
    let cur: GoalRow | undefined = parent;
    while (cur?.parentId) { d++; cur = all.find((g) => g.id === cur!.parentId); }
    return d + 0; // child depth = parent depth + 1 handled below
  })()) : 0;
  const childDepth = parentId ? depth + 1 : 1;
  const horizon = HORIZON_BY_DEPTH[Math.min(childDepth, 4) - 1]!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parentId: parentId || null,
          title,
          horizon,
          kind,
          measureType,
          unit: unit || null,
          targetValue: targetValue ? parseFloat(targetValue) : null,
          direction,
          startDate: startDate || null,
          targetDate: targetDate || null,
          status: "active",
        }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel rounded p-4 space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <label className="lg:col-span-2">
          <span className="label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder='e.g. "Ship POS v1"' />
        </label>
        <label>
          <span className="label">Parent</span>
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— root (life) —</option>
            {all.map((g) => (
              <option key={g.id} value={g.id}>
                {"· ".repeat(kindDepth(all, g))}{g.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">Kind</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {["objective", "project", "milestone"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Measure type</span>
          <select className="input" value={measureType} onChange={(e) => setMeasureType(e.target.value)}>
            {["binary", "quantity", "duration", "deadline"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
            <option disabled>frequency · percentage · rate — P1</option>
          </select>
        </label>
        <label>
          <span className="label">Direction</span>
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="at_least">at least (build up)</option>
            <option value="at_most">at most (budget)</option>
          </select>
        </label>

        <label>
          <span className="label">Target value</span>
          <input className="input num" inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder={measureType === "duration" ? "hours, e.g. 100" : "12"} />
        </label>
        <label>
          <span className="label">Unit label</span>
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="articles / hours / …" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Start</span>
            <input type="date" className="input num" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            <span className="label">Target date</span>
            <input type="date" className="input num" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="chip chip-metric">auto horizon: {horizon}</span>
        <button className="btn btn-accent" disabled={busy}>Create</button>
        {error && <span className="text-xs" style={{ color: "var(--bad)" }}>{error}</span>}
      </div>
    </form>
  );
}

function kindDepth(all: GoalRow[], g: GoalRow): number {
  let d = 1;
  let cur: GoalRow | undefined = g;
  while (cur?.parentId) {
    d++;
    cur = all.find((x) => x.id === cur!.parentId);
  }
  return d - 1;
}
