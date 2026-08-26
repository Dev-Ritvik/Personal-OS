"use client";

/** Minimal structural shape — accepts ANY TanStack mutation instance. */
interface MutationLike {
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
}

/**
 * Calm, local mutation status (remediation: user-facing error transparency).
 * Saved / Pending sync / Failed — retry. No toasts, no noise.
 */
export function OpStatus({
  mutation,
  labels,
}: {
  mutation: MutationLike;
  labels?: { saved?: string; pending?: string; failed?: string };
}) {
  const l = {
    saved: labels?.saved ?? "Saved",
    pending: labels?.pending ?? "Pending sync",
    failed: labels?.failed ?? "Failed — will retry",
  };

  if (mutation.isPending) return <span className="chip chip-metric">…</span>;

  const err: unknown = mutation.error;
  if (err) {
    const name =
      typeof err === "object" && err !== null
        ? ((err as { name?: string }).name ?? "")
        : "";
    if (name === "OfflineQueued") {
      return (
        <span className="chip chip-metric" title="Stored on this device; syncs when online">
          {l.pending}
        </span>
      );
    }
    const msg = err instanceof Error ? err.message : "error";
    return (
      <span className="chip chip-insufficient" title={msg} role="status">
        {l.failed}
      </span>
    );
  }
  if (mutation.isSuccess) return <span className="chip chip-fact">{l.saved}</span>;
  return null;
}
