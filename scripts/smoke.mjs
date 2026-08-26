/**
 * End-to-end API smoke test against a running dev server.
 * Assumes a fresh DB (bootstraps its own account).
 * Run: node scripts/smoke.mjs
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Secret, TOTP } from "otpauth";

// Fresh-database guarantee unless explicitly disabled. The suite's scenario
// (bootstrap → confirm → …) only makes sense from an empty instance.
if (process.env.SMOKE_RESET !== "0") {
  const TABLES = "users, sessions, categories, category_history, goals, behaviors, tasks, plan_instances, time_entries, measurements, events, reflections, metric_snapshots, intervention_log, audit_log, sync_ops";
  try {
    execSync(`docker exec pos-db-dev psql -U postgres -d pos -c "TRUNCATE ${TABLES} CASCADE"`, { stdio: "ignore" });
  } catch {
    console.error("NOTE: could not auto-reset DB (docker/pos-db-dev unavailable?) — continuing against current state.");
  }
}

let cookie = "";
let failures = 0;

// Unique per-run source address so the server's in-memory rate-limit buckets
// never leak state between consecutive smoke runs.
const RUN_IP = `10.10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

function check(name, cond, detail = "") {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

async function req(method, path, body, opts = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      "x-forwarded-for": opts.ip ?? RUN_IP,
      ...(opts.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setters =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  if (opts.captureCookie !== false) {
    for (const sc of setters) {
      if (sc.startsWith("pos_session=") && !sc.includes("=")) continue;
      if (sc.startsWith("pos_session=")) cookie = sc.split(";")[0];
    }
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, res };
}

async function main() {
  const setupToken = readFileSync("setup-token.txt", "utf8").trim();

  /* health */
  const h = await req("GET", "/api/health");
  check("health db=true", h.json?.db === true);

  /* unauthenticated access is rejected (AC8) */
  const anon = await fetch(BASE + "/api/goals");
  check("unauth goals → 401", anon.status === 401);

  /* bootstrap */
  const bs = await req("POST", "/api/bootstrap", {
    setupToken,
    email: `smoke-${Date.now()}@local.test`,
    password: "correct-horse-battery",
    timezone: "America/New_York",
  });
  check("bootstrap 200", bs.status === 200, JSON.stringify(bs.json));
  const secret = bs.json?.totpSecret;

  const dup = await req("POST", "/api/bootstrap", {
    setupToken, email: "x@y.test", password: "correct-horse-battery", timezone: "UTC",
  });
  // C5: pre-confirmation, a token-gated retry RECOVERS (rotates the secret).
  check(
    "pre-confirmation re-bootstrap recovers + rotates secret",
    dup.json?.kind === "recovered" && dup.json?.totpSecret !== secret,
    JSON.stringify(dup.json)?.slice(0, 160),
  );

  const badTok = await req("POST", "/api/bootstrap", {
    setupToken: "wrong-token-wrong-token-wrong",
    email: "z@z.test", password: "correct-horse-battery", timezone: "UTC",
  });
  check("bad setup token → 403", badTok.status === 403, JSON.stringify(badTok.json));

  /* confirm TOTP using the LATEST (recovered) secret → session */
  const activeSecret = dup.json.totpSecret;

  /* confirm TOTP → session */
  const totp = new TOTP({ secret: Secret.fromBase32(activeSecret), digits: 6, period: 30, algorithm: "SHA1" });
  const cf = await req("POST", "/api/bootstrap/confirm", { code: totp.generate() });
  check("bootstrap confirm sets session", cf.status === 200 && cookie.includes("pos_session"), JSON.stringify(cf.json));

  const email = JSON.parse(cf.res.headers.get("x-smoke-email") ?? '""') || undefined;
  void email;

  /* seed data via APIs */
  const cat = await req("POST", "/api/categories", { name: "Deep Work", valueClass: "productive" });
  check("category created", cat.status === 200 || cat.json?.data?.id, JSON.stringify(cat.json));

  /* idempotency: same clientOpId twice → one row + replay header (AC11 server side) */
  const opId = crypto.randomUUID();
  const t1 = await req("POST", "/api/tasks", { title: "Smoke task A", clientOpId: opId });
  const t2 = await req("POST", "/api/tasks", { title: "Smoke task A", clientOpId: opId });
  check("first create 200", t1.status === 200);
  check(
    "replay returns same id + header",
    t2.status === 200 &&
      t2.json?.data?.id === t1.json?.data?.id &&
      t2.res.headers.get("x-idempotent-replay") === "true",
    JSON.stringify(t2.json),
  );

  /* behavior + auto plan generation (AC1) */
  const beh = await req("POST", "/api/behaviors", {
    title: "Read",
    categoryId: cat.json?.data?.id ?? null,
    schedule: { type: "daily" },
    target: { unit: "pages", aggregation: "count", perDay: 20 },
  });
  check("behavior created", beh.status === 200);

  const todayRes = await req("GET", `/api/metrics/today?deviceTz=America%2FNew_York`);
  const today = todayRes.json?.data;
  check("today payload loads", !!today);
  check("AC1 scheduled behavior appears in today plan", (today?.focus.behaviors.length ?? 0) >= 1, JSON.stringify(today?.focus));

  /* check-in */
  const inst = today.focus.behaviors[0];
  const ci = await req("POST", `/api/plan-instances/${inst.instanceId}/checkin`, { actualQty: 20 });
  check("checkin met", ci.json?.data?.met === true);

  /* timer start/stop (AC2) */
  const st = await req("POST", "/api/timer", { action: "start", deviceTz: "America/New_York" });
  check("timer started", st.json?.data?.endedAt === null && st.json?.data?.startedAt);
  const run = await req("GET", `/api/timer`);
  check("running timer readable", run.json?.data?.id === st.json?.data?.id, JSON.stringify(run.json));
  const sp = await req("POST", "/api/timer", { action: "stop" });
  check("timer stopped with duration", typeof sp.json?.data?.durationSec === "number");

  /* quick log */
  const ql = await req("POST", "/api/time-entries", {
    durationMin: 30,
    categoryId: cat.json?.data?.id,
    note: "smoke session",
    deviceTz: "America/New_York",
  });
  check("quick-log created", ql.json?.data?.durationSec === 1800);

  /* C6: offline-style stop carries the client stop instant */
  const st2 = await req("POST", "/api/timer", { action: "start", deviceTz: "America/New_York" });
  const pastStop = new Date(Date.parse(st2.json.data.startedAt) + 5 * 60_000).toISOString();
  const sp2 = await req("POST", "/api/timer", {
    action: "stop",
    stoppedAt: pastStop,
  });
  check(
    "carried stop instant yields exact duration (not server-now)",
    Math.abs(sp2.json?.data?.durationSec - 300) <= 1,
    JSON.stringify(sp2.json),
  );

  /* correction protocol: amend voids original, links sibling (AC10) */
  const am = await req("POST", `/api/time-entries/${ql.json.data.id}`, {
    durationMin: 45,
    note: "corrected",
  });
  check(
    "amend creates corrected row referencing original",
    am.json?.data?.durationSec === 2700 && am.json?.data?.id !== ql.json.data.id,
  );
  const dayEntries = await req(
    "GET",
    `/api/time-entries?date=${new Date().toISOString().slice(0, 10)}&deviceTz=America%2FNew_York`,
  );
  const orig = dayEntries.json.data.find((e) => e.id === ql.json.data.id);
  // Architecture §13: the VOIDED original carries amended_by → its replacement.
  const chainIntact =
    orig?.voidedAt && orig?.amendedBy === am.json.data.id;
  check("original voided but preserved; amended_by → replacement", !!chainIntact);

  /* defer task ×3 → measured postponement (AC3) */
  const taskId = t1.json?.data?.id;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 3; i++) {
    await req("POST", `/api/tasks/${taskId}`, { newDueDate: tomorrow });
  }
  const tasks = await req("GET", "/api/tasks");
  const deferred = [...tasks.json.data.overdue, ...tasks.json.data.today, ...tasks.json.data.inbox]
    .find((t) => t.id === taskId);
  check("AC3 deferred_count == 3", deferred?.deferredCount === 3, String(deferred?.deferredCount));

  /* goal pace numbers present when behind (AC6 shape) */
  const goal = await req("POST", "/api/goals", {
    title: "Smoke quantity goal",
    horizon: "life", kind: "objective", measureType: "quantity",
    targetValue: 100, unit: "units", startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    targetDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    status: "active",
  });
  check("goal created", goal.status === 200);

  /* snapshot job + analytics */
  const snap = await req("POST", "/api/jobs/snapshot", {});
  check("snapshot job runs", snap.json?.ok === true && snap.json.daysWritten > 0, JSON.stringify(snap.json));
  const an = await req("GET", "/api/analytics?days=14");
  check("analytics has registry formulas", !!an.json?.data?.metrics?.registry?.m4_unknown_time_share?.formula);
  const m4Formula = an.json?.data?.metrics?.registry?.m4_unknown_time_share?.formula;
  check("M4 formula exposes definition (AC15)", /unknown/.test(m4Formula ?? ""));

  /* export contains entities (AC12) */
  const ex = await fetch(BASE + "/api/export", { headers: { cookie } });
  const exported = await ex.json();
  check(
    "export includes timeEntries & behaviors & tasks",
    exported?.counts?.timeEntries >= 1 && exported?.counts?.behaviors >= 1 && exported?.counts?.tasks >= 1,
    JSON.stringify(exported?.counts),
  );
  check("export includes audit trail (C8)", exported?.counts?.auditLog >= 1);
  const rawExport = JSON.stringify(exported);
  check(
    "export leaks no credential material (C8)",
    !/passwordHash.*\$s\d|totpSecretEnc|totp_secret_enc/.test(rawExport),
  );

  /* C1: buckets arrive tz-resolved from the client's diary day */
  const nyToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const tk = await req("GET", `/api/tasks?date=${nyToday}`);
  check("tasks endpoint returns resolved buckets", Array.isArray(tk.json?.data?.overdue));

  /* bootstrap rate limit (C5): dedicated bucket, expect a 429 within 6 tries */
  const RL_IP = "203.0.113.7";
  let saw429 = false;
  for (let i = 0; i < 6; i++) {
    const r = await req("POST", "/api/bootstrap", {
      setupToken: "deliberately-wrong-token-value",
      email: `rl-${i}@local.test`,
      password: "correct-horse-battery",
      timezone: "UTC",
    }, { ip: RL_IP, captureCookie: false });
    if (r.status === 429) { saw429 = true; break; }
  }
  check("bootstrap POST rate-limits abusive attempts (C5/§15)", saw429);

  /* confirmed account must NOT re-enter bootstrap/recovery */
  const reentry = await req("POST", "/api/bootstrap", {
    setupToken, email: "again@local.test", password: "correct-horse-battery", timezone: "UTC",
  });
  check(
    "post-confirmation bootstrap refuses (already_bootstrapped)",
    reentry.json?.error?.code === "already_bootstrapped",
    JSON.stringify(reentry.json)?.slice(0, 140),
  );

  console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECKS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
