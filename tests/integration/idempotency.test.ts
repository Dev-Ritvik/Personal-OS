import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { idempotent, ApiError, IDEMPOTENCY_TTL_MS } from "@/server/api";
import { ensureTestDb, truncateAll, makeUser } from "./helpers";

const ready = await ensureTestDb();

(ready ? describe : describe.skip)("C4 — idempotency lifecycle", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  it("1. normal replay: second call returns stored response with replayed=true", async () => {
    let executions = 0;
    const op = crypto.randomUUID();
    const r1 = await idempotent(userId, op, "t", async () => ({ n: ++executions }));
    const r2 = await idempotent(userId, op, "t", async () => ({ n: ++executions }));
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.result).toEqual(r1.result);
    expect(executions).toBe(1);
  });

  it("2. concurrent duplicate while live → 409 op_in_flight (transient), never a duplicate record", async () => {
    const op = crypto.randomUUID();
    // Simulate a live peer holding the reservation.
    await prisma.syncOp.create({
      data: { id: crypto.randomUUID(), userId, clientOpId: op, op: { desc: "t" } },
    });
    await expect(
      idempotent(userId, op, "t", async () => ({})),
    ).rejects.toMatchObject({ code: "op_in_flight" });
  });

  it("3. handler failure after reservation deletes the reservation (no wedge)", async () => {
    const op = crypto.randomUUID();
    await expect(
      idempotent(userId, op, "t", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const row = await prisma.syncOp.findUnique({ where: { clientOpId: op } });
    expect(row).toBeNull();
  });

  it("4. retry after failure executes cleanly", async () => {
    const op = crypto.randomUUID();
    let attempts = 0;
    await expect(
      idempotent(userId, op, "t", async () => {
        attempts++;
        if (attempts === 1) throw new Error("transient");
        return { ok: true };
      }),
    ).rejects.toThrow("transient");
    const r = await idempotent(userId, op, "t", async () => {
      attempts++;
      return { ok: true };
    });
    expect(r.result).toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it("5. five repeated retries converge to one stored execution + replay", async () => {
    const op = crypto.randomUUID();
    let executions = 0;
    let last: { result: unknown; replayed: boolean } | null = null;
    for (let i = 0; i < 4; i++) {
      await expect(
        idempotent(userId, op, "t", async () => {
          executions++;
          throw new Error(`attempt-${i}`);
        }),
      ).rejects.toThrow(`attempt-${i}`);
    }
    for (let i = 0; i < 5; i++) {
      last = await idempotent(userId, op, "t", async () => ({
        n: ++executions,
      }));
    }
    expect(executions).toBe(5); // 4 failures + exactly 1 success
    expect(last!.replayed).toBe(true);
  });

  it("6. deterministic validation failure is never recorded and always re-executes", async () => {
    const op = crypto.randomUUID();
    for (let i = 0; i < 3; i++) {
      await expect(
        idempotent(userId, op, "t", async () => {
          throw new ApiError(400, "validation_failed", "bad input");
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(await prisma.syncOp.findUnique({ where: { clientOpId: op } })).toBeNull();
  });

  it("7. stale reservation (crashed process) is taken over after TTL", async () => {
    const op = crypto.randomUUID();
    await prisma.syncOp.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        clientOpId: op,
        op: { desc: "t" },
        receivedAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1000),
      },
    });
    let executed = false;
    const r = await idempotent(userId, op, "t", async () => {
      executed = true;
      return { recovered: true };
    });
    expect(executed).toBe(true);
    expect(r.replayed).toBe(false);
    // And the recovered op now replays deterministically.
    const r2 = await idempotent(userId, op, "t", async () => ({ recovered: false }));
    expect(r2.replayed).toBe(true);
    expect(r2.result).toEqual({ recovered: true });
  });

  it("8. CONCURRENT stale claimers: CAS ownership → handler executes EXACTLY once", async () => {
    const op = crypto.randomUUID();
    await prisma.syncOp.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        clientOpId: op,
        op: {},
        receivedAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 5_000),
      },
    });

    let executions = 0;
    const handler = async () => {
      executions++;
      await prisma.auditLog.create({
        data: { id: crypto.randomUUID(), actor: userId, action: "c4race", entity: "probe" },
      });
      return { ok: true, n: executions };
    };

    // Both callers read the SAME stale reservation before either claims.
    const settled = await Promise.allSettled([
      idempotent(userId, op, "probe", handler),
      idempotent(userId, op, "probe", handler),
    ]);

    // Invariant: exactly ONE domain side effect.
    expect(executions).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { actor: userId, action: "c4race" } }),
    ).toBe(1);

    // Exactly one response stored on the reservation.
    const row = await prisma.syncOp.findUniqueOrThrow({ where: { clientOpId: op } });
    expect(row.response).not.toBeNull();

    // Winner fulfilled non-replayed; loser either transient-409'd or — if it
    // happened to read after the response landed — replayed. Never executed.
    const fulfilled = settled.filter(
      (s) => s.status === "fulfilled",
    ) as PromiseFulfilledResult<any>[];
    const rejected = settled.filter(
      (s) => s.status === "rejected",
    ) as PromiseRejectedResult[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const f of fulfilled) {
      if (!f.value.replayed) {
        expect((f.value.result as { n: number }).n).toBe(1);
      }
    }
    for (const r of rejected) {
      expect((r.reason as ApiError).code).toBe("op_in_flight");
    }

    // Five subsequent retries converge: every one replays the stored response;
    // no further execution.
    for (let i = 0; i < 5; i++) {
      const again = await idempotent(userId, op, "probe", handler);
      expect(again.replayed).toBe(true);
      expect(again.result).toEqual({ ok: true, n: 1 });
    }
    expect(executions).toBe(1);
    expect(await prisma.auditLog.count({ where: { actor: userId, action: "c4race" } })).toBe(1);
  });

  it("9. superseded owner cannot overwrite the winner's stored response", async () => {
    const op = crypto.randomUUID();
    // Stale reservation so caller A can claim and enter its handler.
    await prisma.syncOp.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        clientOpId: op,
        op: {},
        receivedAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1_000),
      },
    });

    // Caller A's handler runs LONGER than the TTL. Mid-handler we age the
    // reservation and let caller B complete the entire claim→store lifecycle.
    const loser = idempotent(userId, op, "t", async () => {
      await prisma.syncOp.update({
        where: { clientOpId: op },
        data: { receivedAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1_000) },
      });
      await idempotent(userId, op, "t", async () => ({ winner: true }));
      return { loser: true };
    });

    await expect(loser).rejects.toMatchObject({ code: "op_superseded" });

    const row = await prisma.syncOp.findUniqueOrThrow({ where: { clientOpId: op } });
    expect(row.response).toMatchObject({ winner: true });
  });

  it("cross-user clientOpId collision is rejected, never replayed across principals", async () => {
    const other = await makeUser();
    const op = crypto.randomUUID();
    await idempotent(userId, op, "t", async () => ({ mine: true }));
    await expect(
      idempotent(other.id, op, "t", async () => ({ stolen: true })),
    ).rejects.toMatchObject({ code: "op_owner_conflict" });
  });

  it("response-less rows are exempt from naive cleanup filters (Prisma.AnyNull works)", async () => {
    const op = crypto.randomUUID();
    await prisma.syncOp.create({
      data: { id: crypto.randomUUID(), userId, clientOpId: op, op: {} },
    });
    const res = await prisma.syncOp.deleteMany({
      where: { clientOpId: op, response: { equals: Prisma.AnyNull } },
    });
    expect(res.count).toBe(1);
  });
});
