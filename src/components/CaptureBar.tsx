"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCategories,
  useQuickLog,
  useTimerActions,
  useTimer,
} from "@/lib/client/hooks";

function elapsed(startedAt: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Capture bar — the lowest-friction surface in the product (P-6).
 * One row: running timer with live clock + stop, or start; quick-log duration
 * + category. Usable in seconds.
 */
export function CaptureBar({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const timer = useTimer();
  const categories = useCategories();
  const { start, stop } = useTimerActions();
  const quickLog = useQuickLog();

  const [running, setRunning] = useState<string | null>(null);
  const [durationMin, setDurationMin] = useState("30");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  const t = timer.data;
  const startedAt = t?.startedAt ?? null;

  useEffect(() => {
    if (!startedAt) {
      setRunning(null);
      return;
    }
    setRunning(startedAt);
    const iv = setInterval(() => setRunning(startedAt), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  const busy = start.isPending || stop.isPending || quickLog.isPending;
  const cats = categories.data ?? [];

  return (
    <div className="panel rounded p-3 flex flex-wrap items-center gap-2">
      {/* Timer */}
      <div className="flex items-center gap-2 min-w-56 flex-1">
        {t ? (
          <>
            <span className="num text-lg font-semibold" style={{ color: "var(--accent)" }}>
              {running ? elapsed(running) : "…"}
            </span>
            <span className="text-xs truncate max-w-40" style={{ color: "var(--muted)" }}>
              {t.label}
              {t.note ? ` · ${t.note}` : ""}
            </span>
            <button className="btn" disabled={busy} onClick={() => stop.mutate()}>
              Stop
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-accent"
              disabled={busy}
              onClick={() =>
                start.mutate({
                  categoryId: categoryId || null,
                  note: note || null,
                })
              }
            >
              ▶ Start timer
            </button>
            {!compact && (
              <span className="text-2xs" style={{ color: "var(--faint)" }}>
                exact instants; survives reload & device switch
              </span>
            )}
          </>
        )}
      </div>

      {/* Quick log */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          aria-label="Duration minutes"
          type="number"
          min={1}
          max={1440}
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
          className="input num w-16 text-center"
        />
        <span className="text-2xs" style={{ color: "var(--faint)" }}>min</span>
        <select
          aria-label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="input w-36 text-xs"
        >
          <option value="">uncategorized</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Note"
          placeholder="what was it? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input w-44 text-xs"
        />
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            const dur = parseInt(durationMin, 10);
            if (!dur || dur <= 0) return;
            quickLog.mutate(
              { durationMin: dur, categoryId: categoryId || null, note: note || null },
              {
                onSuccess: () => {
                  setNote("");
                  void qc.invalidateQueries();
                },
              },
            );
          }}
        >
          Log time
        </button>
      </div>
    </div>
  );
}
