"use client";

import type { MetricResultDto } from "@/lib/client/hooks";

const EPISTEMIC_LABEL: Record<string, string> = {
  observed_fact: "fact",
  computed_metric: "metric",
  statistical_inference: "inference",
  correlation: "correlation",
  prediction: "prediction",
  recommendation: "recommendation",
};

function fmtVal(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

/** Widened value contract: tiles render numeric metrics, but the envelope is
 *  structurally checked so call-site narrowing stays simple. */
export interface TileResult {
  status: "ok" | "insufficient_data";
  value?: unknown;
  gates: Array<{ name: string; observed: number; required: number; passed: boolean }>;
  meta: {
    key: string;
    label: string;
    formula: string;
    epistemic: string;
    interpretation: string;
    limitation: string;
  };
}

function renderValue(v: unknown, digits: number): string {
  if (typeof v === "number") return v.toFixed(digits);
  return String(v);
}

/**
 * Every displayed number renders through this tile (AC15): value + gate state
 * + epistemic badge + full formula/interpretation/limitation popover.
 * Insufficient data is a first-class render state (AC7).
 */
export function MetricTile({
  result,
  suffix,
  digits = 2,
}: {
  result?: TileResult;
  suffix?: string;
  digits?: number;
}) {
  if (!result) {
    return (
      <div className="panel rounded p-3 animate-pulse" aria-busy>
        <div className="h-3 w-20 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  const meta = result.meta;
  const insufficient = result.status !== "ok";

  const gateSummary = insufficient
    ? result.gates
        .filter((g) => !g.passed)
        .map((g) => `${g.name} n=${g.observed}/${g.required}`)
        .join(" · ")
    : null;

  return (
    <details className="panel rounded p-3 group open:bg-transparent">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-2">
          <span className="text-2xs uppercase tracking-wider" style={{ color: "var(--faint)" }}>
            {meta.label}
          </span>
          <span className={`chip ${insufficient ? "chip-insufficient" : `chip-${meta.epistemic.replace("computed_", "")}`}`}>
            {insufficient ? "insufficient" : EPISTEMIC_LABEL[meta.epistemic] ?? meta.epistemic}
          </span>
        </div>
        <div className="num mt-1 text-xl font-semibold leading-tight">
          {insufficient ? (
            <span title={gateSummary ?? ""} style={{ color: "var(--faint)" }}>
              Insufficient data{gateSummary ? ` (${gateSummary})` : ""}
            </span>
          ) : (
            <>
              {renderValue(result.value, digits)}
              {suffix && (
                <span className="text-sm font-normal ml-1" style={{ color: "var(--muted)" }}>
                  {suffix}
                </span>
              )}
            </>
          )}
        </div>
      </summary>

      <dl className="mt-3 space-y-1.5 border-t pt-2 text-2xs leading-relaxed" style={{ color: "var(--muted)" }}>
        <div>
          <dt className="inline uppercase tracking-wide" style={{ color: "var(--faint)" }}>Formula&nbsp;·&nbsp;</dt>
          <dd className="inline num">{meta.formula}</dd>
        </div>
        <div>
          <dt className="inline uppercase tracking-wide" style={{ color: "var(--faint)" }}>Reads&nbsp;·&nbsp;</dt>
          <dd className="inline">{meta.interpretation}</dd>
        </div>
        <div>
          <dt className="inline uppercase tracking-wide" style={{ color: "var(--faint)" }}>Limits&nbsp;·&nbsp;</dt>
          <dd className="inline">{meta.limitation}</dd>
        </div>
        {result.gates.length > 0 && (
          <div className="num">
            gates: {result.gates.map((g) => `${g.name} ${g.observed}/${g.required}${g.passed ? " ✓" : ""}`).join(", ")}
          </div>
        )}
      </dl>
    </details>
  );
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function minutes(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export { fmtVal as formatValue };
