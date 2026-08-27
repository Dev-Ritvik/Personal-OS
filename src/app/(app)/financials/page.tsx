"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

export default function FinancialsPage() {
  const summary = useQuery({
    queryKey: ["financials-summary"],
    queryFn: () => api<{ data: any }>("/api/financials/summary").then((r) => r.data),
  });
  const entries = useQuery({
    queryKey: ["financials-entries"],
    queryFn: () => api<{ data: any[] }>("/api/financials/entries").then((r) => r.data),
  });
  const goals = useQuery({
    queryKey: ["financials-goals"],
    queryFn: () => api<{ data: any[] }>("/api/financials/goals").then((r) => r.data),
  });

  const [kind, setKind] = useState("EXPENSE");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const s = summary.data as any;

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    await api("/api/financials/entries", {
      body: { kind, amount: parseFloat(amount), occurredOn, note: note || null },
    });
    setAmount("");
    setNote("");
    await Promise.all([summary.refetch(), entries.refetch()]);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Financials</h1>
      <p className="text-2xs" style={{ color: "var(--muted)" }}>
        Tuition is expected to be covered by family. This tracks your living/savings trajectory toward ₹5L. No financial advice — FACT vs METRIC vs INFERENCE labeled.
      </p>

      {/* Summary — gated */}
      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Summary</h2>
        {summary.isLoading ? (
          <div className="h-16 animate-pulse rounded" style={{ background: "var(--panel-2)" }} />
        ) : s?.insufficient ? (
          <p className="text-xs chip chip-insufficient">Insufficient data — fewer than 3 entries. Log income and expenses to see savings rate and runway.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-2xs" style={{ color: "var(--faint)" }}>Income — FACT</div><div className="num">₹{s.totalIncome?.toLocaleString("en-IN")}</div></div>
            <div><div className="text-2xs" style={{ color: "var(--faint)" }}>Expense — FACT</div><div className="num">₹{s.totalExpense?.toLocaleString("en-IN")}</div></div>
            <div><div className="text-2xs" style={{ color: "var(--faint)" }}>Savings — METRIC</div><div className="num">₹{s.savings?.toLocaleString("en-IN")}</div></div>
            <div><div className="text-2xs" style={{ color: "var(--faint)" }}>Savings rate — METRIC</div><div className="num">{s.savingsRate !== null ? `${(s.savingsRate * 100).toFixed(1)}%` : "—"}</div></div>
          </div>
        )}
        {s?.runway !== null && s?.runway !== undefined && !s.insufficient && (
          <p className="text-2xs mt-2" style={{ color: "var(--muted)" }}>Runway (INFERENCE): ~{s.runway.toFixed(1)} months at current spend — assumes trajectory continues.</p>
        )}
      </section>

      {/* Savings goals */}
      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Savings goals</h2>
        {(goals.data ?? []).map((g: any) => (
          <div key={g.id} className="flex items-center gap-3 py-2 border-t" style={{ borderColor: "var(--line)" }}>
            <div className="flex-1">
              <div className="text-sm">{g.title}</div>
              <div className="num text-2xs" style={{ color: "var(--faint)" }}>₹{Number(g.targetAmount).toLocaleString("en-IN")} {g.targetDate ? `→ ${new Date(g.targetDate).toLocaleDateString()}` : ""}</div>
            </div>
            {g.progress !== null && !g.insufficient ? (
              <div className="w-24 h-2 rounded overflow-hidden" style={{ background: "var(--panel-2)" }}>
                <div className="h-full" style={{ width: `${Math.min(100, g.progress * 100)}%`, background: "var(--accent)" }} />
              </div>
            ) : (
              <span className="chip chip-insufficient text-2xs">insufficient data</span>
            )}
          </div>
        ))}
        {(goals.data ?? []).length === 0 && <p className="text-xs" style={{ color: "var(--faint)" }}>No savings goals yet.</p>}
      </section>

      {/* Add entry */}
      <form onSubmit={addEntry} className="panel rounded p-4 flex flex-wrap gap-2 items-end">
        <label className="w-28">
          <span className="label">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input text-xs">
            <option value="EXPENSE">EXPENSE</option>
            <option value="INCOME">INCOME</option>
          </select>
        </label>
        <label className="w-28">
          <span className="label">Amount (₹)</span>
          <input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input num text-xs" placeholder="500" required />
        </label>
        <label className="w-36">
          <span className="label">Date</span>
          <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} className="input num text-xs" />
        </label>
        <label className="flex-1 min-w-32">
          <span className="label">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input text-xs" placeholder="optional" />
        </label>
        <button className="btn btn-accent">Add</button>
      </form>

      {/* Ledger */}
      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Ledger — FACT rows</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-2xs num">
            <thead style={{ color: "var(--faint)" }}>
              <tr className="text-left"><th className="pr-2">date</th><th className="pr-2">kind</th><th className="pr-2">amount</th><th>note</th></tr>
            </thead>
            <tbody style={{ color: "var(--muted)" }}>
              {(entries.data ?? []).slice(0, 30).map((e: any) => (
                <tr key={e.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="pr-2 py-1">{new Date(e.occurredOn).toLocaleDateString()}</td>
                  <td className="pr-2">{e.kind}</td>
                  <td className="pr-2">₹{Number(e.amount).toLocaleString("en-IN")}</td>
                  <td className="truncate max-w-32">{e.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(entries.data ?? []).length === 0 && <p className="text-2xs mt-2" style={{ color: "var(--faint)" }}>No entries yet. FACT: recorded income — METRIC: calculated savings rate — INFERENCE: trajectory.</p>}
        </div>
      </section>
    </div>
  );
}
