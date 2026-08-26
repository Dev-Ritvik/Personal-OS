import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listTasks, updateTask } from "@/server/services/tasks";
import { ensureTestDb, truncateAll, makeUser } from "./helpers";
import { uuidv7 } from "@/server/ids";

const ready = await ensureTestDb();

function d(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

(ready ? describe : describe.skip)("C1 — tz-aware task buckets", () => {
  let userId: string;
  const TODAY = "2026-06-15";

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  async function mk(title: string, fields: Partial<{ dueDate: string | null; status: string }> = {}) {
    return prisma.task.create({
      data: {
        id: uuidv7(),
        userId,
        title,
        dueDate: fields.dueDate === undefined ? null : fields.dueDate ? d(fields.dueDate) : null,
        status: (fields.status ?? "todo") as never,
        completedAt: fields.status === "done" ? new Date() : null,
      },
    });
  }

  it("overdue / today / tomorrow / no-date / done-overdue / cancelled-overdue classify correctly", async () => {
    await mk("past-open", { dueDate: "2026-06-10" });
    await mk("today-open", { dueDate: TODAY });
    await mk("tomorrow-open", { dueDate: "2026-06-16" });
    await mk("no-date");
    await mk("far-future", { dueDate: "2026-07-01" });
    await mk("done-overdue", { dueDate: "2026-06-01", status: "done" });
    await mk("cancelled-overdue", { dueDate: "2026-06-02", status: "cancelled" });

    const b = await listTasks(userId, TODAY);

    expect(b.overdue.map((t) => t.title)).toEqual(["past-open"]);
    expect(b.today.map((t) => t.title)).toEqual(["today-open"]);
    const inboxTitles = b.inbox.map((t) => t.title).sort();
    expect(inboxTitles).toEqual(["far-future", "no-date", "tomorrow-open"]);
    // Only completed work lands in `done`; cancelled is intentionally bucketless.
    expect(b.done.map((t) => t.title)).toEqual(["done-overdue"]);
    const everywhere = [
      ...b.overdue, ...b.today, ...b.inbox, ...b.done,
    ].map((t) => t.title);
    expect(everywhere).not.toContain("cancelled-overdue");
  });

  it("timezone boundary: resolving a different local day shifts the today/overdue split", async () => {
    await mk("edge-task", { dueDate: "2026-06-16" });
    // UTC− user still on 06-15 → task belongs to the future bucket.
    const before = await listTasks(userId, "2026-06-15");
    expect(before.today).toHaveLength(0);

    // UTC+ user already on 06-16 → same instant, different diary day.
    const after = await listTasks(userId, "2026-06-16");
    expect(after.today.map((t) => t.title)).toEqual(["edge-task"]);
    expect(after.overdue).toHaveLength(0);
  });

  it("C9: completion freezes completed_local_date; reopen annuls; re-complete restamps", async () => {
    const t = await mk("freeze-me", { dueDate: TODAY });
    const done1 = await updateTask(userId, t.id, { status: "done" }, { todayLocal: "2026-03-08" });
    expect(done1.completedLocalDate?.toISOString().slice(0, 10)).toBe("2026-03-08");

    const reopened = await updateTask(userId, t.id, { status: "todo" }, { todayLocal: "2026-03-09" });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.completedLocalDate).toBeNull();

    const done2 = await updateTask(userId, t.id, { status: "done" }, { todayLocal: "2026-03-09" });
    expect(done2.completedLocalDate?.toISOString().slice(0, 10)).toBe("2026-03-09");
  });
});
