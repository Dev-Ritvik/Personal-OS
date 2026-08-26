import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
 * Idempotent command execution via sync_ops (ARCHITECTURE.md §14).
 * Replaying the same clientOpId returns the ORIGINAL response with
 * `x-idempotent-replay: true` — five retries never create five records.
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

  const opId = uuidv7();
  try {
    await prisma.syncOp.create({
      data: { id: opId, userId, clientOpId, op: { desc: opDesc } },
    });
  } catch {
    const existing = await prisma.syncOp.findUnique({ where: { clientOpId } });
    if (existing?.response !== null && existing?.response !== undefined) {
      return {
        result: existing.response as T,
        replayed: true,
      };
    }
    // Recorded but no stored response (crash window): treat as conflict.
    throw new ApiError(409, "op_in_flight", "Operation already recorded; retry shortly");
  }

  const result = await handler();
  await prisma.syncOp.update({
    where: { clientOpId },
    data: { response: result as object },
  });
  return { result, replayed: false };
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
