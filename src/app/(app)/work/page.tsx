"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTasks, useTaskMutations } from "@/lib/client/hooks";
import { localToday } from "@/lib/client/api";
import { OpStatus } from "@/components/OpStatus";

export default function WorkPage() {
  // C1: the diary day is resolved client-side and always transmitted.
  const { data, isLoading } = useTasks(localToday());
  const { create, setStatus, defer } = useTaskMutations();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [est, setEst] = useState("");

  if (isLoading) return <div className="panel rounded h-40 animate-pulse" />;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await create.mutateAsync({
      title,
      dueDate: due || null,
      estimateMin: est ? parseInt(est, 10) : null,
    });
    setTitle(""); setDue(""); setEst("");
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Work</h1>

      <form onSubmit={add} className="panel rounded p-3 flex flex-wrap gap-2 items-center">
        <input
          className="input flex-1 min-w-48"
          placeholder="Add task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input aria-label="Due date" type="date" className="input num w-36" value={due} onChange={(e) => setDue(e.target.value)} />
        <input aria-label="Estimate minutes" type="number" min={1} placeholder="min" className="input num w-20 text-center" value={est} onChange={(e) => setEst(e.target.value)} />
        <button className="btn btn-accent" disabled={create.isPending}>Add</button>
      </form>

      <Bucket
        title={`Overdue · ${data?.overdue.length ?? 0}`}
        tone="var(--bad)"
        tasks={data?.overdue}
        status={defer || setStatus}
        onDone={(id) => setStatus.mutate({ id, status: "done" })}
        onDefer={(id) => defer.mutate({ id, newDueDate: tomorrow() })}
      />
      <Bucket
        title={`Today · ${data?.today.length ?? 0}`}
        tasks={data?.today}
        status={defer || setStatus}
        onDone={(id) => setStatus.mutate({ id, status: "done" })}
        onDefer={(id) => defer.mutate({ id, newDueDate: tomorrow() })}
      />
      <Bucket
        title={`Inbox · ${data?.inbox.length ?? 0}`}
        tasks={data?.inbox}
        status={defer || setStatus}
        onDone={(id) => setStatus.mutate({ id, status: "done" })}
        onDefer={(id) => defer.mutate({ id, newDueDate: tomorrow() })}
      />
      <OpStatus mutation={create} labels={{ saved: "Task added", pending: "Adding… queued" }} />

      <details>
        <summary className="text-xs cursor-pointer" style={{ color: "var(--faint)" }}>
          Completed ({data?.done.length ?? 0})
        </summary>
        <ul className="mt-2 space-y-1">
          {data?.done.slice(0, 30).map((t) => (
            <li key={t.id} className="text-xs line-through" style={{ color: "var(--faint)" }}>
              {t.title}
            </li>
          ))}
        </ul>
      </details>

      <p className="text-2xs" style={{ color: "var(--faint)" }}>
        Deferral is measured: each defer increments a counter and stamps time — chronic deferral ≥3 surfaces as an
        evidence-backed signal, never a silent date shuffle.
      </p>
    </div>
  );
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function Bucket({
  title, tasks, tone, onDone, onDefer, status,
}: {
  title: string;
  tasks?: Array<{ id: string; title: string; dueDate: string | null; deferredCount: number; estimateMin: number | null }>;
  tone?: string;
  status: Parameters<typeof OpStatus>[0]["mutation"];
  onDone: (id: string) => void;
  onDefer: (id: string) => void;
}) {
  return (
    <section className="panel rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wider num" style={{ color: tone ?? "var(--faint)" }}>
          {title}
        </h2>
        <OpStatus mutation={status} labels={{ saved: "Saved", pending: "Queued" }} />
      </div>
      {(tasks?.length ?? 0) === 0 ? (
        <p className="text-xs" style={{ color: "var(--faint)" }}>Empty.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
          {tasks!.map((t) => (
            <li key={t.id} className="py-2 flex items-center gap-2">
              <button className="btn" onClick={() => onDone(t.id)}>✓</button>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{t.title}</div>
                <div className="num text-2xs" style={{ color: t.deferredCount >= 3 ? "var(--warn)" : "var(--faint)" }}>
                  {t.dueDate ?? "no date"}
                  {t.deferredCount > 0 && ` · deferred ×${t.deferredCount}`}
                  {t.estimateMin && ` · ~${t.estimateMin}m`}
                </div>
              </div>
              <button className="btn text-2xs" onClick={() => onDefer(t.id)}>defer →</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

void localToday;
