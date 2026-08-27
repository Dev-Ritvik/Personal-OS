import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { uuidv7 } from "./ids";
import { getSessionUser, type SessionUser } from "./auth/session";

/** Typed API error mapped to HTTP status by handle(). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

/** Wrap a route handler with uniform error mapping + structured logging. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return json(
          {
            error: {
              code: "validation_failed",
              message: "Request validation failed",
              details: err.flatten(),
            },
          },
          { status: 400 },
        );
      }
      console.error(
        JSON.stringify({
          level: "error",
          msg: "unhandled_api_error",
          err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        }),
      );
      return json(
        { error: { code: "internal", message: "Internal server error" } },
        { status: 500 },
      );
    }
  };
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthorized", "Authentication required");
  return user;
}

/**
 * How long a response-less reservation is considered "in flight" before a
 * retry may take it over. Handlers here are sub-second; 120s is generous.
 * This bounds the crash window (C4): an operation can never be wedged longer
 * than the TTL, because any later retry claims the stale reservation and
 * re-executes deterministically.
 */
export const IDEMPOTENCY_TTL_MS = 120_000;

/**
 * Idempotent command execution via sync_ops (ARCHITECTURE.md §14, remediated C4).
 *
 * Lifecycle:
 *   reserve (insert, response=null)
 *     ├─ handler ok    → store response            → later calls REPLAY
 *     ├─ handler threw → delete reservation        → retry re-executes cleanly
 *     └─ process died  → reservation ages out      → after TTL any retry takes
 *                                                   over (atomic conditional
 *                                                   update) and re-executes
 * Duplicate while live → 409 op_in_flight (transient; clients retry).
 * Deterministic failures are never recorded → retrying is always safe.
 *
 * Cross-user collision on clientOpId is rejected outright.
 */
export async function idempotent<T>(
  userId: string,
  clientOpId: string | undefined,
  opDesc: string,
  handler: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  if (!clientOpId) {
    return { result: await handler(), replayed: false };
  }

  const existing = await prisma.syncOp.findUnique({ where: { clientOpId } });

  if (existing) {
    if (existing.userId !== userId) {
      throw new ApiError(409, "op_owner_conflict", "clientOpId belongs to another principal");
    }
    if (existing.response !== null && existing.response !== undefined) {
      return { result: existing.response as T, replayed: true };
    }
    const ageMs = Date.now() - existing.receivedAt.getTime();
    if (ageMs < IDEMPOTENCY_TTL_MS) {
      throw new ApiError(409, "op_in_flight", "Operation already in progress; retry shortly");
    }
    // Stale reservation (crashed process): COMPARE-AND-SWAP claim.
    // The WHERE pins the exact receivedAt THIS caller observed — if another
    // stale caller claimed between our read and our write, its timestamp
    // differs, our update matches zero rows, and we bow out (transient 409).
    // Exactly one concurrent caller can ever hold ownership.
    const claimed = await prisma.syncOp.updateMany({
      where: {
        clientOpId,
        response: { equals: Prisma.JsonNull },
        receivedAt: existing.receivedAt,
      },
      data: { receivedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, "op_in_flight", "Operation claimed by another caller; retry shortly");
    }
  } else {
    try {
      await prisma.syncOp.create({
        data: { id: uuidv7(), userId, clientOpId, op: { desc: opDesc } },
      });
    } catch {
      // Lost a create race — re-read and classify.
      const cur = await prisma.syncOp.findUnique({ where: { clientOpId } });
      if (!cur || cur.userId !== userId) {
        throw new ApiError(409, "op_owner_conflict", "clientOpId belongs to another principal");
      }
      if (cur.response !== null && cur.response !== undefined) {
        return { result: cur.response as T, replayed: true };
      }
      throw new ApiError(409, "op_in_flight", "Operation already in progress; retry shortly");
    }
  }

  try {
    const result = await handler();
    // Ownership-safe response store: only the CURRENT owner (response still
    // null) may write. A superseded caller never clobbers the winner.
    const stored = await prisma.syncOp.updateMany({
      where: { clientOpId, response: { equals: Prisma.JsonNull } },
      data: { response: result as object },
    });
    if (stored.count === 0) {
      // Our ownership was taken over mid-handler (handler exceeded TTL).
      // The new owner will produce/store a response; surface transient conflict.
      throw new ApiError(409, "op_superseded", "Operation ownership changed during execution; retry");
    }
    return { result, replayed: false };
  } catch (err) {
    if (err instanceof ApiError && err.code === "op_superseded") throw err;
    // Never leave a poisoned reservation behind: the op is retryable as-is.
    await prisma.syncOp
      .deleteMany({ where: { clientOpId, response: { equals: Prisma.JsonNull } } })
      .catch(() => undefined);
    throw err;
  }
}

export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId?: string,
  diff?: unknown,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: uuidv7(),
      actor,
      action,
      entity,
      entityId: entityId ?? null,
      diff: (diff as object) ?? undefined,
    },
  });
}
