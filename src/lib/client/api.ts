/**
 * Client data layer: uniform JSON API access + persistent offline queue.
 * Every mutating call carries a client_op_id (ARCHITECTURE.md §14) so server
 * replays are idempotent — five retries never create five records (AC11).
 */

const QUEUE_KEY = "pos.queue.v1";
const FAILED_KEY = "pos.queue.failed.v1";

export interface QueuedOp {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  createdAt: number;
  tries: number;
}

function load(key: string): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as QueuedOp[];
  } catch {
    return [];
  }
}
function save(key: string, ops: QueuedOp[]) {
  localStorage.setItem(key, JSON.stringify(ops));
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pendingCount(): number {
  return load(QUEUE_KEY).length;
}

export function failedCount(): number {
  return load(FAILED_KEY).length;
}

export function clearFailed(): void {
  save(FAILED_KEY, []);
  notify();
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export class OfflineQueued extends Error {}

let flushing = false;

/** Sequential flush; network errors stop the pass (order preserved). */
export async function flushQueue(): Promise<{ flushed: number }> {
  if (flushing || typeof window === "undefined") return { flushed: 0 };
  flushing = true;
  let flushed = 0;
  try {
    let ops = load(QUEUE_KEY);
    const failed = load(FAILED_KEY);
    while (ops.length > 0) {
      const op = ops[0]!;
      let res: Response;
      try {
        res = await fetch(op.url, {
          method: op.method,
          headers: { "content-type": "application/json" },
          body: op.body === undefined ? undefined : JSON.stringify(op.body),
          credentials: "same-origin",
        });
      } catch {
        break; // still offline — keep order, retry later
      }
      ops = load(QUEUE_KEY);
      if (!ops.length || ops[0]!.id !== op.id) break; // changed underneath
      if (res.ok) {
        ops.shift();
        save(QUEUE_KEY, ops);
        flushed++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        ops.shift();
        save(QUEUE_KEY, ops);
        failed.push({ ...op, tries: op.tries + 1 });
        save(FAILED_KEY, failed);
      } else {
        op.tries++;
        ops[0] = op;
        save(QUEUE_KEY, ops);
        break; // transient — back off
      }
      notify();
    }
  } finally {
    flushing = false;
    notify();
  }
  return { flushed };
}

let installed = false;
export function flushOnEvents(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("online", () => void flushQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushQueue();
  });
  setInterval(() => void flushQueue(), 30_000);
  void flushQueue();
}

/**
 * Core fetch. Mutating calls get an injected client_op_id; when offline or on
 * network failure they are durably queued instead of lost.
 */
export async function api<T>(
  url: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const mutative = method !== "GET";
  let body = opts.body;

  if (mutative && body !== undefined && typeof body === "object") {
    body = {
      ...(body as Record<string, unknown>),
      clientOpId: crypto.randomUUID(),
    };
  }

  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new ApiHttpError(res.status, err?.error?.message ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiHttpError) throw err;
    // Network-level failure → durable queue for mutative ops.
    if (mutative) {
      const ops = load(QUEUE_KEY);
      ops.push({
        id: crypto.randomUUID(),
        url,
        method: method as QueuedOp["method"],
        body,
        createdAt: Date.now(),
        tries: 0,
      });
      save(QUEUE_KEY, ops);
      notify();
      throw new OfflineQueued("Saved locally; will sync when back online");
    }
    throw err;
  }
}

export class ApiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Invalidate helpers shared by hooks. */
export function tzParam(): string {
  return `deviceTz=${encodeURIComponent(deviceTimezone())}`;
}
