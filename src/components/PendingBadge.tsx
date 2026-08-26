"use client";

import { usePendingOps } from "@/lib/client/hooks";

/** Sync indicator — visible honesty about offline state (§14). */
export function PendingBadge() {
  const { pending, failed, flushNow, clearFailed } = usePendingOps();
  if (pending === 0 && failed === 0) {
    return <span style={{ color: "var(--faint)" }}>synced</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      {pending > 0 && (
        <button
          onClick={() => void flushNow()}
          className="chip chip-metric"
          title="Click to sync now"
        >
          ⟳ {pending} pending
        </button>
      )}
      {failed > 0 && (
        <button onClick={clearFailed} className="chip chip-insufficient" title="Click to discard failed ops">
          ✕ {failed} failed
        </button>
      )}
    </span>
  );
}
