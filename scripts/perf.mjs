/**
 * Performance harness (AC13 preparation). NOT a pass/fail gate.
 *
 * Seeds ~90 days of realistic data directly via Prisma, then measures
 * GET /api/metrics/today latency over N requests and reports p50/p95/p99.
 *
 *   node scripts/perf.mjs [requests=50]
 *
 * Requires: dev DB running + a bootstrapped account (setup-token.txt present,
 * or an existing account). Prints honest numbers; asserts nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const N = Number(process.argv[2] ?? "50");
const prisma = new PrismaClient();

function iso(d) {
  return d.toISOString().slice(0, 10);
}
function day(offset) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + offset);
  return iso(t);
}

async function ensureAccount() {
  const user = await prisma.user.findFirst();
  if (user) return user;
  const setupToken = readFileSync("setup-token.txt", "utf8").trim();
  const res = await fetch(`${BASE}/api/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      setupToken,
      email: `perf-${Date.now()}@local.test`,
      password: "correct-horse-battery",
      timezone: "America/New_York",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`bootstrap failed: ${JSON.stringify(body)}`);
  const { Secret, TOTP } = await import("otpauth");
  const code = new TOTP({
    secret: Secret.fromBase32(body.totpSecret),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  }).generate();
  const confirm = await fetch(`${BASE}/api/bootstrap/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!confirm.ok) throw new Error("confirm failed");
  return prisma.user.findFirstOrThrow();
}

async function main() {
  console.log("[perf] ensuring account…");
  let cookie = "";
  {
    let user = await prisma.user.findFirst();
    if (!user || !user.totpConfirmed) {
      const setupToken = readFileSync("setup-token.txt", "utf8").trim();
      const bs = await fetch(`${BASE}/api/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          setupToken,
          email: `perf-${Date.now()}@local.test`,
          password: "correct-horse-battery",
          timezone: "America/New_York",
        }),
      });
      const b = await bs.json();
      if (!bs.ok && b.error?.code !== "already_bootstrapped")
        throw new Error(JSON.stringify(b));
      if (bs.ok) {
        const { Secret, TOTP } = await import("otpauth");
        const code = new TOTP({
          secret: Secret.fromBase32(b.totpSecret),
          digits: 6,
          period: 30,
          algorithm: "SHA1",
        }).generate();
        const cf = await fetch(`${BASE}/api/bootstrap/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const setCookie = cf.headers.getSetCookie?.() ?? [];
        cookie = setCookie.find((c) => c.startsWith("pos_session="))?.split(";")[0] ?? "";
      }
    }
    user = await prisma.user.findFirstOrThrow();
    console.log("[perf] account:", user.email);

    if (!cookie) {
      // Existing confirmed account: mint a session directly (test-only path).
      const { createHash, randomBytes } = await import("node:crypto");
      const token = randomBytes(32).toString("hex");
      await prisma.session.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      cookie = `pos_session=${token}`;
    }
  }

  console.log("[perf] seeding 90 days of telemetry…");
  const userId = (await prisma.user.findFirstOrThrow()).id;
  const cat = await prisma.category.create({
    data: { id: crypto.randomUUID(), userId, name: "Perf Deep Work", valueClass: "productive" },
  });
  const behavior = await prisma.behavior.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      categoryId: cat.id,
      title: "Perf daily habit",
      schedule: { type: "daily" },
      target: { unit: "times", aggregation: "count", perDay: 1 },
    },
  });
  const goal = await prisma.goal.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      title: "Perf goal",
      horizon: "annual",
      kind: "objective",
      measureType: "quantity",
      targetValue: "100",
      currentValue: "30",
      startDate: new Date(Date.now() - 60 * 86400000),
      targetDate: new Date(Date.now() + 120 * 86400000),
      status: "active",
    },
  });

  const entries = [];
  const plans = [];
  const tasks = [];
  for (let i = 90; i >= 1; i--) {
    const date = day(-i);
    for (let k = 0; k < 3; k++) {
      const start = new Date(`${date}T${String(9 + k).padStart(2, "0")}:00:00Z`);
      entries.push({
        id: crypto.randomUUID(),
        userId,
        startedAt: start,
        endedAt: new Date(start.getTime() + 45 * 60000),
        localDate: new Date(`${date}T00:00:00Z`),
        durationSec: 2700,
        source: "quick_log",
        categoryId: cat.id,
      });
    }
    plans.push({
      id: crypto.randomUUID(),
      userId,
      localDate: new Date(`${date}T00:00:00Z`),
      refType: "behavior",
      refId: behavior.id,
      origin: "schedule",
      plannedQty: 1,
      actualQty: i % 4 === 0 ? null : 1,
      met: i % 4 !== 0,
      doneAt: i % 4 === 0 ? null : new Date(`${date}T18:00:00Z`),
    });
    if (i % 3 === 0) {
      tasks.push({
        id: crypto.randomUUID(),
        userId,
        title: `Perf task ${date}`,
        dueDate: new Date(`${date}T00:00:00Z`),
        status: i % 6 === 0 ? "done" : "todo",
        completedAt: i % 6 === 0 ? new Date(`${date}T19:00:00Z`) : null,
        completedLocalDate: i % 6 === 0 ? new Date(`${date}T00:00:00Z`) : null,
      });
    }
  }
  await prisma.timeEntry.createMany({ data: entries });
  await prisma.planInstance.createMany({ data: plans });
  await prisma.task.createMany({ data: tasks });

  // Snapshot history so M11-style series exist.
  const snapRows = [];
  for (let i = 90; i >= 1; i--) {
    snapRows.push({
      metricKey: `goal_progress:${goal.id}`,
      localDate: new Date(`${day(-i)}T00:00:00Z`),
      value: Math.min(0.9, (91 - i) / 100),
      computedAt: new Date(),
    });
    snapRows.push({
      metricKey: "overdue_count",
      localDate: new Date(`${day(-i)}T00:00:00Z`),
      value: i % 7,
      computedAt: new Date(),
    });
  }
  await prisma.metricSnapshot.createMany({ data: snapRows, skipDuplicates: true });
  console.log(
    `[perf] seeded ${entries.length} entries, ${plans.length} plans, ${tasks.length} tasks, ${snapRows.length} snapshots`,
  );

  console.log(`[perf] measuring GET /api/metrics/today ×${N} …`);
  const latencies = [];
  let failures = 0;
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}/api/metrics/today?deviceTz=America%2FNew_York`, {
        headers: { cookie },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
    } catch (e) {
      failures++;
      console.error("[perf] request failed:", String(e).slice(0, 200));
    }
    latencies.push(performance.now() - t0);
  }

  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
  const report = {
    requests: N,
    failures,
    p50: Number(pct(50).toFixed(1)),
    p95: Number(pct(95).toFixed(1)),
    p99: Number(pct(99).toFixed(1)),
    max: Number(latencies[latencies.length - 1].toFixed(1)),
    unit: "ms",
    measuredAt: new Date().toISOString(),
    note: "local measurement only; AC13 verdict requires production-like deployment",
  };
  writeFileSync("perf-results.json", JSON.stringify(report, null, 2));
  console.table([report]);
  console.log("[perf] AC13 remains UNVERIFIED until measured on production-like infra.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
