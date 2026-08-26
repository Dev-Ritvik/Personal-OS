"use client";

import { useEffect, useState } from "react";
import { useMe, useCategories, useCategoryCreate, useSettingsPatch, useSnapshotJob, useDeleteAll } from "@/lib/client/hooks";
import { OpStatus } from "@/components/OpStatus";

const VALUE_CLASSES = ["productive", "maintenance", "intentional_leisure", "unproductive", "neutral"];
const CONFIRM_PHRASE = "DELETE EVERYTHING";

export default function SettingsPage() {
  const me = useMe();
  const categories = useCategories(true);
  const catCreate = useCategoryCreate();
  const patch = useSettingsPatch();
  const snapshotJob = useSnapshotJob();
  const deleteAll = useDeleteAll();

  const [tz, setTz] = useState("");
  const [ws, setWs] = useState("");
  const [we, setWe] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newClass, setNewClass] = useState("productive");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!me.data) return;
    setTz(me.data.user.timezone);
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    setWs(fmt(me.data.user.wakingStartMin));
    setWe(fmt(me.data.user.wakingEndMin));
  }, [me.data]);

  function toMin(v: string): number {
    const [h, m] = v.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await patch.mutateAsync({
        timezone: tz,
        wakingStartMin: toMin(ws),
        wakingEndMin: toMin(we),
      });
      setMsg("Saved. Applies to future entries only — history keeps its frozen dates.");
    } catch (err) {
      setMsg(err instanceof Error ? `Failed: ${err.message}` : "Failed to save");
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* Profile */}
      <form onSubmit={saveProfile} className="panel rounded p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Profile & day model</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          <label>
            <span className="label">Timezone (future entries)</span>
            <input className="input num text-xs" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/New_York" />
          </label>
          <label>
            <span className="label">Waking start</span>
            <input type="time" className="input num" value={ws} onChange={(e) => setWs(e.target.value)} />
          </label>
          <label>
            <span className="label">Waking end</span>
            <input type="time" className="input num" value={we} onChange={(e) => setWe(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-accent" disabled={patch.isPending}>Save</button>
          <OpStatus mutation={patch} />
          {msg && <span className="text-2xs" style={{ color: patch.isError ? "var(--bad)" : "var(--ok)" }}>{msg}</span>}
        </div>
      </form>

      {/* Categories */}
      <section className="panel rounded p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Categories & value classes</h2>
        <ul className="divide-y text-sm" style={{ borderColor: "var(--line)" }}>
          {categories.data?.map((c) => (
            <li key={c.id} className="py-2 flex items-center justify-between gap-2">
              <span>{c.name}</span>
              <span className={`chip ${c.archivedAt ? "chip-insufficient" : `chip-${c.valueClass === "productive" ? "metric" : ""}`}`}>
                {c.valueClass.replace("_", " ")}
                {c.archivedAt ? " · archived" : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="flex-1 min-w-36">
            <span className="label">New category</span>
            <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Side Project" />
          </label>
          <label>
            <span className="label">Value class</span>
            <select className="input w-44" value={newClass} onChange={(e) => setNewClass(e.target.value)}>
              {VALUE_CLASSES.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}
            </select>
          </label>
          <button
            className="btn btn-accent"
            disabled={!newCat.trim() || catCreate.isPending}
            onClick={async () => {
              await catCreate.mutateAsync({ name: newCat.trim(), valueClass: newClass });
              setNewCat("");
              void categories.refetch();
            }}
          >
            Add
          </button>
        </div>
        <p className="text-2xs" style={{ color: "var(--faint)" }}>
          Value-class changes are versioned — they change what historical analytics mean, so the change itself is recorded.
        </p>
      </section>

      {/* Data & jobs */}
      <section className="panel rounded p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Data</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <a href="/api/export" className="btn" download>Export full JSON</a>
          <button
            className="btn"
            disabled={snapshotJob.isPending}
            onClick={async () => {
              const r = await snapshotJob.mutateAsync(undefined);
              setMsg(`Snapshot recomputed: ${r.daysWritten} days, ${r.goalSeriesWritten} goal series.`);
            }}
          >
            Recompute snapshots (90d)
          </button>
          {snapshotJob.isSuccess && !snapshotJob.isPending && null}
        </div>
        <p className="text-2xs" style={{ color: "var(--faint)" }}>
          Export includes everything, including voided rows — your history is yours. Nightly snapshots also run via cron
          when CRON_SECRET is configured.
        </p>
      </section>

      {/* Security */}
      <section className="panel rounded p-4 space-y-2">
        <h2 className="text-xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>Security</h2>
        {me.data?.sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-1 border-t" style={{ borderColor: "var(--line)" }}>
            <div className="min-w-0">
              <div className="truncate" style={{ color: s.id === me.data!.currentSessionId ? "var(--accent)" : undefined }}>
                {s.userAgent ?? "unknown device"}
                {s.id === me.data!.currentSessionId && " (this session)"}
              </div>
              <div className="num text-2xs" style={{ color: "var(--faint)" }}>last active {new Date(s.lastSeenAt).toLocaleString()}</div>
            </div>
            {s.id !== me.data!.currentSessionId && (
              <button
                className="btn text-2xs"
                onClick={async () => {
                  await fetch("/api/me", {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ sessionId: s.id }),
                  });
                  void me.refetch();
                }}
              >
                revoke
              </button>
            )}
          </div>
        ))}
        <button
          className="btn mt-1"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </section>

      {/* Danger zone — P0 deletion flow (§15) */}
      <section className="panel rounded p-4 space-y-2" style={{ borderColor: "var(--bad)" }}>
        <h2 className="text-xs uppercase tracking-wider" style={{ color: "var(--bad)" }}>Danger zone</h2>
        <p className="text-2xs" style={{ color: "var(--muted)" }}>
          Permanently deletes every record, the account, and all sessions. A single tombstone audit entry remains.
          Export first if in doubt.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input num w-64 text-xs"
            placeholder={CONFIRM_PHRASE}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <button
            className="btn"
            style={{ color: confirmText === CONFIRM_PHRASE ? "var(--bad)" : undefined, borderColor: "var(--bad)" }}
            disabled={confirmText !== CONFIRM_PHRASE || deleteAll.isPending}
            onClick={async () => {
              try {
                await deleteAll.mutateAsync(confirmText);
                window.location.href = "/bootstrap";
              } catch {
                // status rendered below
              }
            }}
          >
            Delete everything
          </button>
          <OpStatus mutation={deleteAll} labels={{ saved: "Deleted" }} />
        </div>
      </section>
    </div>
  );
}
