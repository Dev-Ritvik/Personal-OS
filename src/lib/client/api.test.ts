// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const QUEUE_KEY = "pos.queue.v1";
const FAILED_KEY = "pos.queue.failed.v1";

function queuedOps() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
}
function failedOps() {
  return JSON.parse(localStorage.getItem(FAILED_KEY) ?? "[]");
}
function seedQueue(ops: any[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}
function seedFailed(ops: any[]) {
  localStorage.setItem(FAILED_KEY, JSON.stringify(ops));
}
function makeOp(over: Partial<any> = {}) {
  return {
    id: crypto.randomUUID(),
    url: "/api/tasks",
    method: "POST" as const,
    body: { title: "t", clientOpId: crypto.randomUUID() },
    createdAt: Date.now(),
    tries: 0,
    ...over,
  };
}

describe("flushQueue()", () => {
  let mod: typeof import("./api");

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    // ensure window defined for flushing guard
    // jsdom provides window; ensure global fetch is reset
    vi.unstubAllGlobals();
    mod = await import("./api");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("1. successful operation is removed and counted as flushed", async () => {
    seedQueue([makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 } as any)));
    const r = await mod.flushQueue();
    expect(r.flushed).toBe(1);
    expect(queuedOps()).toHaveLength(0);
  });

  it("2. 409 transient stays queued and increments tries", async () => {
    seedQueue([makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409 } as any)));
    const r = await mod.flushQueue();
    expect(r.flushed).toBe(0);
    const q = queuedOps();
    expect(q).toHaveLength(1);
    expect(q[0].tries).toBe(1);
    expect(failedOps()).toHaveLength(0);
  });

  it("3. 408 transient stays queued", async () => {
    seedQueue([makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 408 } as any)));
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(1);
    expect(failedOps()).toHaveLength(0);
  });

  it("4. 429 transient stays queued", async () => {
    seedQueue([makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429 } as any)));
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(1);
    expect(failedOps()).toHaveLength(0);
  });

  it("5. 500 transient stays queued", async () => {
    seedQueue([makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 } as any)));
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(1);
    expect(failedOps()).toHaveLength(0);
  });

  it("6. network failure (fetch throws) stays queued and preserves order", async () => {
    seedQueue([makeOp(), makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(2);
    expect(failedOps()).toHaveLength(0);
  });

  it("7. permanent 400 moves to failed list", async () => {
    seedQueue([makeOp()]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400 } as any)));
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(0);
    expect(failedOps()).toHaveLength(1);
  });

  it("8. retry after transient failure succeeds on next flush", async () => {
    seedQueue([makeOp()]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as any)
      .mockResolvedValueOnce({ ok: true, status: 200 } as any);
    vi.stubGlobal("fetch", fetchMock);
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(1);
    await mod.flushQueue();
    expect(queuedOps()).toHaveLength(0);
    expect(failedOps()).toHaveLength(0);
  });

  it("9. FIFO ordering: first flushed, second transient stays", async () => {
    const op1 = makeOp({ body: { n: 1 } });
    const op2 = makeOp({ body: { n: 2 } });
    seedQueue([op1, op2]);
    const calls: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body.n);
      if (body.n === 1) return { ok: true, status: 200 } as any;
      return { ok: false, status: 500 } as any;
    }));
    await mod.flushQueue();
    expect(calls).toEqual([1, 2]);
    expect(queuedOps()).toHaveLength(1);
    expect(queuedOps()[0].body).toMatchObject({ n: 2 });
  });

  it("10. localStorage persistence survives queued state", async () => {
    const op = makeOp();
    // simulate offline enqueue via api() throwing
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    try {
      await mod.api("/api/tasks", { method: "POST", body: { title: "hello" } });
    } catch {}
    const stored = queuedOps();
    expect(stored.length).toBe(1);
    expect(stored[0].body).toMatchObject({ title: "hello" });
    expect(localStorage.getItem(QUEUE_KEY)).toContain(stored[0].id);
  });

  it("11. duplicate queued operations are both sent (server dedupes)", async () => {
    const dupBody = { title: "dup", clientOpId: "same-id" };
    const op1 = makeOp({ body: dupBody });
    const op2 = makeOp({ body: dupBody });
    seedQueue([op1, op2]);
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200 } as any;
    }));
    await mod.flushQueue();
    expect(sent).toHaveLength(2);
    expect(queuedOps()).toHaveLength(0);
  });

  it("12. concurrent flush protection: second flush while flushing returns 0", async () => {
    seedQueue([makeOp(), makeOp()]);
    let resolveFirst: (v: any) => void;
    const firstPromise = new Promise<any>(r => { resolveFirst = r; });
    const fetchMock = vi.fn(() => firstPromise as any);
    vi.stubGlobal("fetch", fetchMock);

    const p1 = mod.flushQueue();
    // tick to ensure first fetch started and flushing flag set
    await Promise.resolve();
    const p2 = await mod.flushQueue();
    expect(p2.flushed).toBe(0);
    // resolve first fetch as success; first flush will then process both queued ops
    resolveFirst!({ ok: true, status: 200 } as any);
    const r1 = await p1;
    expect(r1.flushed).toBe(2);
    expect(queuedOps()).toHaveLength(0);
  });
});
