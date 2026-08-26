import { z } from "zod";
import { handle, idempotent, json, requireSession } from "@/server/api";
import { entryAmend } from "@/server/validation";
import { amendEntry, voidEntry } from "@/server/services/timeEntries";

export const dynamic = "force-dynamic";

/**
 * POST amend → correction protocol (AC10): original is voided and a
 * corrected sibling references it via amended_by.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = entryAmend.parse(raw);
    const { result, replayed } = await idempotent(
      s.id,
      raw?.clientOpId as string | undefined,
      `entry.amend:${params.id}`,
      () =>
        amendEntry(
          { userId: s.id, profileTz: s.timezone, deviceTz: input.deviceTz ?? undefined },
          params.id,
          input,
        ),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}

/** DELETE → void without replacement. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    await voidEntry({ userId: s.id, profileTz: s.timezone }, params.id);
    return json({ ok: true });
  })();
}
