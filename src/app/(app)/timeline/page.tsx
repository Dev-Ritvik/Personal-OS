"use client";

import { useState } from "react";
import { useEntries } from "@/lib/client/hooks";
import { deviceTimezone } from "@/lib/client/api";

const VALUE_CLASS_COLOR: Record<string, string> = {
  productive: "var(--accent)",
  maintenance: "var(--muted)",
  intentional_leisure: "var(--ok)",
  unproductive: "var(--bad)",
  neutral: "var(--faint)",
};

/** Day-level timeline (P0 read view): waking bar, entries ledger, gaps visible. */
export default function TimelinePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const entries = useEntries(date);
  void deviceTimezone;

  const rows = entries.data ?? [];
  const live = rows.filter((r) => !r.voidedAt);
  const totalMin = live.reduce((s, r) => s + (r.durationSec ?? 0) / 60, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold">Timeline</h1>
        <input
          aria-label="Date"
          type="date"
          className="input num w-40"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <section className="panel rounded p-4">
        <div className="flex items-baseline justify-between mb-2 text-2xs" style={{ color: "var(--faint)" }}>
          <span>Logged day ledger</span>
          <span className="num">{totalMin > 0 ? `${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}m categorized` : "no entries yet"}</span>
        </div>

        {/* Proportional day bar by category minutes */}
        <svg viewBox={`0 0 ${Math.max(totalMin, 1)} 20`} preserveAspectRatio="none" className="w-full h-5 rounded overflow-hidden" style={{ background: "var(--panel-2)" }} role="img" aria-label="Category distribution">
          {(() => {
            let x = 0;
            return live.map((r) => {
              const w = (r.durationSec ?? 0) / 60;
              if (w <= 0) return null;
              const c = VALUE_CLASS_COLOR[r.category?.valueClass ?? ""] ?? "var(--faint)";
              const rect = <rect key={r.id} x={x} y={0} width={w} height={20} fill={c} opacity={0.75} />;
              x += w;
              return rect;
            });
          })()}
        </svg>

        <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
          {rows.map((r) => {
            const startT = new Date(r.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const endT = r.endedAt ? new Date(r.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "running";
            const mins = r.durationSec !== null ? Math.round(r.durationSec / 60) : null;
            return (
              <li key={r.id} className={`py-2 flex items-center gap-3 ${r.voidedAt ? "opacity-45 line-through" : ""}`}>
                <span className="flex items-center gap-1.5 w-28 shrink-0">
                  <span
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ background: VALUE_CLASS_COLOR[r.category?.valueClass ?? ""] ?? "var(--faint)" }}
                  />
                  <span className="num text-2xs">{startT}–{endT}</span>
                </span>
                <span className="text-sm flex-1 min-w-0 truncate">
                  {r.task?.title ?? r.behavior?.title ?? r.category?.name ?? "Uncategorized"}
                  {r.autoClosed && <span className="chip ml-2">auto-closed</span>}
                  {r.amendedBy && <span className="chip chip-inference ml-2" title="A corrected copy exists; this row is preserved history">amended</span>}
                </span>
                <span className="num text-2xs" style={{ color: "var(--muted)" }}>
                  {mins !== null ? `${mins}m` : "…"}
                </span>
                {!r.voidedAt && r.durationSec !== null && (
                  <AmendMenu entryId={r.id} date={date} />
                )}
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="py-6 text-center text-xs" style={{ color: "var(--faint)" }}>
              Nothing logged for this day. Unknown time is shown on Today.
            </li>
          )}
        </ul>
      </section>

      <p className="text-2xs" style={{ color: "var(--faint)" }}>
        Corrections never destroy history: amending voids the original row and links a corrected sibling to it.
      </p>
    </div>
  );
}

function AmendMenu({ entryId, date }: { entryId: string; date: string }) {
  const [open, setOpen] = useState(false);
  const [dur, setDur] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);

  if (reload) window.location.reload();

  return open ? (
    <form
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--bg) 70%, transparent)" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await fetch(`/api/time-entries/${entryId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              durationMin: dur ? parseInt(dur, 10) : undefined,
              note: note || undefined,
            }),
          });
          setReload(true);
        } finally {
          setBusy(false); setOpen(false);
        }
      }}
    >
      <div className="panel rounded-lg p-5 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">Correct entry</h3>
        <label className="block">
          <span className="label">Corrected duration (minutes)</span>
          <input className="input num" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="leave blank to keep" />
        </label>
        <label className="block">
          <span className="label">Note</span>
          <input className="input text-xs" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-accent" disabled={busy}>Save correction</button>
        </div>
        <input type="hidden" value={date} />
      </div>
    </form>
  ) : (
    <button className="btn text-2xs" onClick={() => setOpen(true)}>
      correct
    </button>
  );
}
