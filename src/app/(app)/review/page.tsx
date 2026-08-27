"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import Link from "next/link";

export default function ReviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["evening-review"],
    queryFn: () => api<{ data: any }>("/api/personal/review").then((r) => r.data),
  });

  if (isLoading) return <div className="panel rounded p-4 h-32 animate-pulse" />;
  if (error) return <p className="panel rounded p-4 text-sm" style={{ color: "var(--bad)" }}>Failed: {String(error)}</p>;
  if (!data) return <p className="panel rounded p-4 text-sm" style={{ color: "var(--faint)" }}>No review — no plan was recorded for today.</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Evening Review</h1>
        <p className="text-2xs num" style={{ color: "var(--faint)" }}>What happened, what was missed, evidence-backed hypotheses why (association, not causation), and what should change tomorrow — facts vs inference, no moralizing.</p>
      </header>

      <section className="panel rounded p-3 grid sm:grid-cols-3 gap-3 text-2xs">
        <div className="panel-2 rounded p-2">
          <div className="uppercase tracking-wider" style={{ color: "var(--faint)" }}>Facts</div>
          <div className="mt-1 space-y-0.5 num" style={{ color: "var(--muted)" }}>
            <div>{data.facts.planned}</div>
            <div>{data.facts.completed}</div>
            <div>Overdue remaining: {data.facts.overdueRemaining}</div>
            <div>Chronic deferred: {data.facts.deferredChronic}</div>
            <div>Productive: {data.facts.productiveMin} min</div>
            <div>Unknown: {data.facts.unknownMin ?? "—"} min {data.facts.unknownShare !== null ? `· ${Math.round(data.facts.unknownShare * 100)}%` : ""}</div>
          </div>
        </div>
        <div className="panel-2 rounded p-2">
          <div className="uppercase tracking-wider" style={{ color: "var(--faint)" }}>Metrics</div>
          <div className="mt-1 space-y-0.5 num" style={{ color: "var(--muted)" }}>
            <div>Completion: {data.metrics.completionRate}</div>
            <div>Execution ratio: {data.metrics.executionRatio !== null ? `${Math.round(data.metrics.executionRatio * 100)}%` : "—"}</div>
            <div>Variance: {data.metrics.varianceMin !== null ? `${data.metrics.varianceMin} min` : "—"}</div>
          </div>
        </div>
        <div className="panel-2 rounded p-2">
          <div className="uppercase tracking-wider" style={{ color: "var(--faint)" }}>Next</div>
          {data.inference && <div className="text-2xs mt-1" style={{ color: "var(--muted)" }}><span style={{ color: "var(--faint)" }}>Inference:</span> {data.inference}</div>}
          {data.recommendation && <div className="text-2xs mt-1 font-medium" style={{ color: "var(--accent)" }}>→ {data.recommendation}</div>}
          {!data.inference && !data.recommendation && <div className="text-2xs mt-1" style={{ color: "var(--faint)" }}>No inference — insufficient plan/actual to compare.</div>}
        </div>
      </section>

      {data.missedCommitments.length > 0 && (
        <section className="panel rounded p-3">
          <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Missed commitments — strict, top 3</h2>
          <ul className="list-disc list-inside text-xs space-y-1">
            {data.missedCommitments.map((m: string, i: number) => <li key={i}>{m}</li>)}
          </ul>
        </section>
      )}

      <div className="text-2xs" style={{ color: "var(--faint)" }}>
        This review never calls you lazy — it shows planned vs recorded, then suggests one concrete change. <Link href="/today" className="hover:underline" style={{ color: "var(--accent)" }}>→ Tomorrow&apos;s Command Brief</Link>
      </div>
    </div>
  );
}
