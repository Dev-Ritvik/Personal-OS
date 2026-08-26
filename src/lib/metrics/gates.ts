import type { GateCheck, MetricMeta, MetricResult } from "./types";

export function ok<T>(meta: MetricMeta, value: T, gates: GateCheck[] = []): MetricResult<T> {
  return { status: "ok", value, gates, meta };
}

export function insufficient<T>(
  meta: MetricMeta,
  gates: GateCheck[],
): MetricResult<T> {
  return { status: "insufficient_data", gates, meta };
}

export function gate(name: string, observed: number, required: number): GateCheck {
  return { name, observed, required, passed: observed >= required };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
