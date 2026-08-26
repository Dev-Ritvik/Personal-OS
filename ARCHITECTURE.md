# POS — Personal Operating System
## Discovery & Architecture Document · v0.1 (Discovery Phase)

> Status: **Architecture complete. Implementation not started.**
> Scope: single-user, private, data-driven behavioral operating system.
> Constraint: first production-quality usable build within ~12 hours.

---

## 0. Executive Summary

POS is a personal telemetry + decision-support system. Its core loop:

```
INTEND (goals → plans)  →  ACT (log reality)  →  MEASURE (metrics)
       ↑                                              ↓
   ADJUST (interventions) ← ANALYZE (trends/correlations)
```

The differentiator versus every habit app: **the system's primary object is evidence, not encouragement.** Every number on screen is classified by epistemic type (`observed_fact | computed_metric | statistical_inference | prediction | recommendation`), rendered with its data sufficiency state, and never dressed up.

Key architectural commitments:
1. **Append-mostly history**: corrections create amendments; raw records are never mutated into oblivion.
2. **Server-authoritative sync** with offline write queue — one source of truth, laptop and mobile converge.
3. **Metrics as pure, tested functions** over a stable day-fact layer — analytics correctness is the product.
4. **Unknown time is a first-class signal**, not an absence of data.
5. **Rule-based, explainable interventions** with cooldowns — no spam, no manipulation.

Recommended stack (rationale in §16): Next.js monolith + PostgreSQL (Supabase) + TypeScript metric core; mobile via responsive PWA in P0/P1, native shell deferred.

---

## 1. Product Definition

**One-line:** A private analytical instrument that records what you actually do, compares it to what you intended, quantifies drift and waste, and tells you — with stated uncertainty — what is working, what isn't, and why it probably is that way.

**What it is:**
- Goal hierarchy manager with measurable definitions
- Behavioral execution ledger (habits, tasks, time)
- Plan-vs-actual variance engine
- Time allocation analyzer with waste detection
- Trend / correlation / risk analytics
- Evidence-based intervention system

**What it is not:**
- Not a gamified tracker (no XP, streak flames, badges)
- Not a motivational toy (no cheerleading copy)
- Not a general to-do app (tasks exist only in service of measurement)
- Not multi-user SaaS (one principal user; architecture allows N=1 hard-coded)

**Primary success criterion (product-level):**
After 8 weeks of use, the user can answer, with cited numbers from the system: *"Where did my time actually go, which of my goals am I genuinely behind on, what behaviors correlate with good days, and what should I change?"* — and each answer carries an honest confidence label.

---

## 2. Product Principles

| # | Principle | Consequence |
|---|-----------|-------------|
| P-1 | **Truth > motivation** | UI never inflates progress. Missed targets render as missed targets, plainly. |
| P-2 | **Every number has an epistemic class** | Fact vs metric vs inference vs prediction vs recommendation are visually distinct. |
| P-3 | **Insufficient data is a valid answer** | Below minimum sample size → "Insufficient data (n=X of Y required)". Never fabricate. |
| P-4 | **Correlation ≠ causation** | Correlation views carry explicit non-causal framing + n + strength caveat. |
| P-5 | **History is sacred** | Corrections append; deletions archive. Analytical reproducibility preserved forever. |
| P-6 | **Friction is the enemy of truth** | Logging must take <10s for common cases, or the data becomes garbage. Capture modes ranked by friction. |
| P-7 | **No moralizing** | "Unproductive" is *the user's own label*, applied by the user's config. System analyzes; it does not judge. |
| P-8 | **Interventions must be explainable** | Every alert shows its trigger rule + underlying numbers + dismiss control. |
| P-9 | **Privacy by architecture** | Single account, least privilege, exportable, deletable, self-hostable. |
| P-10 | **Boring reliability** | Calm visual language, no dopamine mechanics, deterministic behavior, tested metrics. |

---

## 3. User Model

### 3.1 The Principal
Exactly one authenticated human ("principal"). No roles, no sharing, no social graph. `users` table exists as security boundary and preference container, not as a product concept.

### 3.2 Entity Analysis (from candidate list → verdict)

| Candidate entity | Verdict | Rationale |
|---|---|---|
| goal / objective | **KEEP (unified `Goal`)** | One self-referencing tree covers life→annual→quarterly→project→milestone. Separate tables would duplicate measure/progress logic. |
| project | **KEEP as Goal node_type** | A project is a goal node with child tasks/milestones. No separate table. |
| milestone | **KEEP as Goal node (kind=milestone)** | Binary measurable leaf. |
| habit / recurring behavior | **KEEP (`Behavior`)** | Distinct lifecycle (schedule-driven) justifies separate entity. |
| routine | **FOLD INTO Behavior groups** (P1) | A named ordered set of Behaviors executed together. Not needed P0. |
| task | **KEEP (`Task`)** | One-off actionable unit; links optionally to goals/projects/behaviors. |
| commitment | **DROP** | Redundant with Task+due date or Behavior schedule. Avoids dual sources of truth. |
| time block (planned) | **KEEP (`PlanInstance`)** | Derived automatically from schedules + manual overrides. Needed for plan-vs-actual variance. |
| activity / session | **KEEP unified as `TimeEntry`** | Actual recorded time. Source field distinguishes timer / quick-log / retro-fill / import. |
| measurement | **KEEP (`Measurement`)** | Free-form daily numeric series (sleep, weight, mood-neutral "energy"). Fuel for correlations. |
| observation / event | **KEEP (`Event`, typed)** | Interruptions, distractions, idle periods — point-in-time facts with duration. |
| outcome | **FOLD INTO Goal status transitions + snapshot** | Outcomes are goal terminal states + achieved-value at close, snapshotted. |
| reflection | **KEEP (`Reflection`)** | Daily text journal; searchable context for diagnostics. |
| constraint | **P2** | e.g., "no work Sundays". Model later as schedule exceptions; do not build now. |
| priority | **KEEP as fields** (task.priority, category weight), not entity. |
| environment | **P2** | Context tags (home/office/travel) on TimeEntry via tag system. Defer. |
| interruption / distraction | **KEEP as Event subtypes** | Central to anti-waste analytics. |
| category (time taxonomy) | **KEEP (`Category`)** | User-defined classification with value_class axis. Foundation of anti-waste. |

**Final entity set (P0):** `User, Category, Goal (tree), Behavior, Task, PlanInstance, TimeEntry, Measurement, Event, Reflection`
**(P1 adds):** `RoutineGroup, InterventionLog, MetricSnapshot` *(snapshot actually P0-lite)*

### 3.3 Core Relations

```
Goal ──self──> Goal (parent_id tree, depth ≤ 4: life/annual/quarterly/project-milestone)
Goal <──optional── Behavior        (behavior serves a goal)
Goal <──optional── Task            (task serves a goal/project)
Behavior ──generates──> PlanInstance (per day, per schedule)
Task     ──can have──> PlanInstance (scheduled focus block)
TimeEntry >──optional──> Task | Behavior | Category
Event     >──optional──> Category | TimeEntry-context
Measurement, Reflection ── keyed by local_date
```

---

## 4. Core Feature Map

| Domain | Feature | Priority |
|---|---|---|
| Goals | CRUD tree (life/annual/quarterly/project/milestone), measure definition, status lifecycle, progress computation | P0 (subset of measure types) / P1 (all types) |
| Behaviors | Define schedule + target; daily check-in with quantity; auto plan generation | P0 |
| Tasks | Quick add, estimates, due dates, done/defer (defer counted), link to goals | P0 |
| Time capture | Timer (start/stop, survives reload), quick-log duration, end-of-day retro gap-fill | P0 (timer+quick-log), P1 (retro assist) |
| Categories | Editor with value_class assignment | P0 |
| Dashboard (Today) | What matters now, plan vs done, risk flags, fast capture bar | P0 |
| Analytics v1 | Execution rate, consistency, plan-actual variance, unknown-time share, postponement, overdue backlog, goal pace | P0 |
| Analytics v2 | Time-of-day profile, correlation explorer, trend slopes, recovery time | P1 |
| Interventions | Rule engine v1 (6 rules), cooldowns, log | P1 |
| Measurements | Custom numeric series entry + charting | P1 |
| Reflections | Daily note, linked to day facts | P1 |
| Sync/offline | Offline queue, background sync, conflict-safe writes | P0 (basic queue) / P1 (hardening) |
| Data portability | Full JSON export; CSV per entity | P0 (JSON) / P1 (CSV, import) |
| Security | Auth (single user), session mgmt, rate limiting, backups script | P0 |
| Forecasting | Pace projection with widening bands | P2 |
| Integrations | Calendar import, screen-time import | P2 |

---

## 5. Information Architecture

### 5.1 Navigation (stable across devices)

```
Today          ← default landing; answers "what matters now"
Timeline       ← day/week time view: planned blocks vs actual entries vs gaps
Goals          ← tree browser + goal detail (progress, pace, linked work)
Work           ← Tasks (inbox/today/overdue/done) 
Behaviors      ← definitions + check-in surface + per-behavior history
Analytics      ← metric library, trends, correlation explorer (P1), data-sufficiency states
Journal        ← reflections + events feed (P1)
Settings       ← categories editor, waking hours, timezone, thresholds, interventions config,
                  data export/import/delete, auth/security
```

Mobile: bottom tab bar (Today / Timeline / Check-in / Goals / More). Desktop: left sidebar, same routes.

### 5.2 Today Dashboard — mandated question coverage

| Question | Widget |
|---|---|
| What matters today? | Ordered focus list: scheduled behaviors, due tasks, active goal focus block |
| Did I check in? | Behavior check-in strip (one tap + quantity) |
| Am I logging time? | Live timer card + quick-log + "unknown time so far" counter |
| How am I doing today? | Plan-vs-actual bar (planned min vs logged min, split by value_class) |
| What's slipping? | Flags row: overdue count, deferral warnings, behind-pace goals, unknown-share warning |
| What next? | Single recommendation slot (highest-evidence item); empty state if no basis |

Design language: dense but calm. Neutral dark/light theme, monospaced numerals for figures, restrained accent (single hue), no animation beyond functional transitions. Charts: line/bar only, labeled axes, honest y-axis starting at zero unless annotated otherwise.

---

## 6. Goal Model

### 6.1 Hierarchy

```
Life objective (horizon=life)
 └─ Annual objective (horizon=annual)
     └─ Quarterly objective (horizon=quarterly)
         ├─ Project (node_kind=project)      ← container for tasks
         │   ├─ Milestone (kind=milestone)   ← binary leaf w/ target date
         │   └─ Task (separate entity, FK to project goal)
         └─ Behavior link (recurring work serving the objective)
```

Depth ≤ 4 enforced. Progress rolls up: parent progress = weighted mean of children progress (weights default equal; configurable per child). Roll-up is *computed*, never stored on the parent (except snapshots).

### 6.2 Measure Types

| Type | Definition | Progress formula | Notes |
|---|---|---|---|
| `binary` | Done/not-done by target_date | 0 or 1 (with date-awareness: overdue shows 0 + age) | milestones |
| `quantity` | Cumulative numeric target (e.g., 12 articles) | current_sum / target | sum of linked completed units or manual updates |
| `duration` | Total hours (e.g., 100h practice) | logged_seconds_linked / target_seconds | auto-fed from TimeEntries linked to goal subtree |
| `frequency` | N occurrences per period (e.g., 3×/week gym) | rolling-window compliance (see below) | window = period length, trailing |
| `percentage` | 0–100% state (e.g., body-fat proxy) | clamp((current−start)/(target−start)) | direction-aware |
| `milestone` | Named checkpoint w/ date | binary + date | alias of binary with kind |
| `deadline` | Date-bound completion | time-elapsed % vs completion % shown side by side | exposes slippage explicitly |
| `cumulative` | Monotonic total (e.g., books read YTD) | same as quantity, period=YTD | |
| `rate` | Maintain ≥ X/day avg over trailing W days | trailing_avg / X | anti-streak: forgiving windows |

**Frequency/rate compliance (anti-streak design):**
`compliance(window) = min(1, occurrences_in_window / required_in_window)`
Displayed alongside `deficit` (how many short) and `surplus`. A missed Tuesday is recoverable by Thursday; the system reports the window truthfully rather than punishing the miss symbolically.

### 6.3 Progress Semantics
- All progress values ∈ [0,1] internally; display in native units.
- `direction`: `at_least` (default) or `at_most` (e.g., "≤ 5h social media/wk") — at_most goals compute compliance inverted.
- **Pace (goal risk):** `required_velocity = remaining / remaining_days`; `observed_velocity = trailing_14d_rate`. Ratio <1 ⇒ behind pace, shown with both numbers (see §10 M11).

### 6.4 Status Lifecycle
`draft → active → paused → (active | achieved | abandoned)` — plus `archived`.
Terminal transitions record `closed_at`, `closing_value` (measured value at close), and optional `postmortem_reflection_id`. Abandonment is a legitimate, modeled outcome — the system tracks how often plans die because that itself is signal.

---

## 7. Habit / Behavior Model

### 7.1 Definition
A `Behavior` = recurring intended action with:
- `title`, optional `goal_id`, `category_id` (default classification of its time)
- `schedule` JSONB: `{type:"weekly", days:[1..7]} | {type:"times_per_week", n} | {type:"daily"}`
- `target` JSONB: `{unit, per_day_value?, aggregation:"count"|"sum"|"minutes"|"max", weekly_min?}`
- `status`, `started_on`, optional `paused_until`

### 7.2 Execution Record
Daily `BehaviorLog` is avoided as a separate table — check-ins are represented as `PlanInstance(actual)` pairs:
- Each scheduled day auto-creates a `PlanInstance(behavior_id, local_date, origin=schedule)`.
- Check-in sets `actual_count / actual_minutes / done_at` on that instance.
- Extra (unscheduled) executions create `PlanInstance(origin=ad_hoc, actual…)` — captured so surplus counts.

This unification means **plan-vs-actual variance works identically for habits and tasks** — one comparison engine.

### 7.3 Consistency Metrics (streak demotion)

Streaks may be *displayed as descriptive fact* but are never primary. Primary battery:

| Metric | Definition | Why better than streak |
|---|---|---|
| 30-day adherence | scheduled days with met target / scheduled days | robust to single misses |
| Weighted recency score | adherence weighted w(d)=exp(−age_days/21) | recent behavior matters more |
| Compliance ratio (rolling) | Σactual_target_units / Σrequired_units over trailing 28d | magnitude-aware, forgives distribution |
| Recovery latency | median days from miss → next met day | measures resilience, the real skill |
| Volatility | stdev of daily execution rate | distinguishes steady-70% from feast-famine |
| Longest gap (trailing 90d) | max consecutive unmet scheduled days | early-warning for decay |

All require `n_scheduled ≥ 5` before rendering; below that → insufficient-data state.

---

## 8. Time Model

### 8.1 Capture Modes (friction-ranked)

| Mode | Friction | Accuracy | Use case | Priority |
|---|---|---|---|---|
| **Timer** | minimal | high (start instant exact) | deep work sessions | P0 |
| **Quick-log** | low | medium (duration recalled) | meetings, workouts, errands after the fact | P0 |
| **Retro gap-fill** | medium (batch) | medium-low | evening review of uncaptured hours | P1 |
| **Import** (calendar/screen-time) | zero | high but coarse | passive enrichment | P2 |

Timer semantics: `TimeEntry(started_at, ended_at=null)` is "running"; elapsed computed on read ⇒ **reload/device-switch safe**. Stop writes ended_at. Running timer per device allowed; server keeps latest-started authoritative, others auto-closed at new start − ε with flag `auto_closed=true`.

### 8.2 Classification

Every minute lands in exactly one bucket at analysis time:
1. Explicitly categorized TimeEntry → its `Category.value_class` ∈ {productive, maintenance, intentional_leisure, unproductive, neutral}
2. Entry linked to Behavior/Task → inherits their category
3. Everything else within waking window → **unknown**

Categories are user-authored (principle P-7). Defaults provided at seed: Deep Work, Admin, Health, Learning, Chores, Social, Entertainment, Rest — all editable/renameable; renaming archives old label references via `category_versions`? No — renames mutate name only (display concern); **value_class changes are versioned** (append to `category_history`) since they change historical analytics meaning.

### 8.3 Day Facts Layer
Nightly (and on-demand) job normalizes raw rows into `metric_snapshots` keyed `(date, metric_key)`:
waking_minutes, categorized_by_class, unknown_minutes, planned_minutes, executed_planned_minutes, behavior_scheduled/met, tasks_due/done/deferred, interruptions_total_sec, switches_count…

Downstream analytics read **only** this layer ⇒ stable, testable, historically frozen (raw edits don't silently rewrite past conclusions; recompute is explicit).

### 8.4 Questions this model answers (traceability)

| Question | Answered by |
|---|---|
| Where did my time go? | Timeline: entries grouped by value_class/category vs waking budget |
| Intended vs actual? | PlanInstances.actual vs planned; §10 M3 |
| Productive vs lost? | value_class rollup + unknown share (M4) |
| When most productive? | Hour-bucket execution/focus profile (M13) |
| Which activities precede failed sessions? | Sequence mining on event streams (P2) |
| Activities associated with successful days? | Correlation layer (M14) |

---

## 9. Anti-Waste Model

**Waste is defined operationally, never morally:** a *waste signal* is a measured divergence between intention and execution, or time the user themselves classified as low-value.

### 9.1 Signal Catalog (v1 rules, thresholds user-configurable)

| Signal | Operational definition | Data source |
|---|---|---|
| Unknown-time excess | unknown_minutes / waking_minutes > τ (default 40%) sustained D days | day facts |
| Unplanned activity share | ad_hoc minutes / total minutes > τ (default 50%) | PlanInstances vs TimeEntries |
| Chronic postponement | task.deferred_count ≥ 3 OR consecutive-due-date pushes | tasks |
| Overplanning | planned_hours / trailing28d median executed productive hours > 1.4 for 7d | facts |
| Under-execution | 1 − executed/planned, trailing 14d mean > 30% | facts |
| Context switching | distinct category transitions per active-hour above personal baseline ×1.5 | ordered entries |
| Interruption load | Σ distraction-event minutes inside focus windows / focus minutes > τ | events |
| Idle-in-work-block | gaps > 15min inside timer sessions flagged retroactively | entries |
| Schedule violation rate | scheduled behaviors missed / scheduled, trailing 14d > 35% | instances |
| Backlog growth | overdue-count slope positive 3 weeks running | tasks |
| Value-class drift | intentional_leisure+unproductive share rising > 20pp vs prior month | facts |

### 9.2 Presentation Contract
Signals appear only in Analytics + dashboard flags row, always as: `{signal_name, current_value, threshold, window, evidence_link}`. No red flashing, no shame copy. Neutral phrasing: *"Overplanning ratio 1.6× your executed baseline over 7 days."*

### 9.3 Non-goals
No app-blocking, no screen-time surveillance daemons, no moral scoring. POS observes self-reported + manually captured reality.

---

## 10. Analytics Model — Metric Catalog

Every metric specifies: **definition · inputs · interpretation · limitations · min-data gate**. Epistemic class noted.

**M1 Execution Rate (day)** — `met_scheduled / scheduled` (behaviors) and separately tasks_done/due.
Fact-derived. Limitation: gameable by under-planning; pair with M8. Gate: none (descriptive).

**M2 Consistency Score (30d)** — mean daily M1 over days-with-obligations, recency-weighted exp(−age/21).
Gate: n≥10 obligation days. Limitation: insensitive to overshoot.

**M3 Plan–Actual Variance** — `executed_planned_minutes − planned_minutes` (day/week), plus % form.
Interpretation: chronic negative ⇒ planning optimism or avoidance (disambiguate via M8/M9). Gate: 5 planned days.

**M4 Unknown-Time Share** — `unknown / waking` (§8.2). Interpretation: observability gap; **meta-gate**: when >60%, other insights show degraded-confidence badge. This is the system's honesty mechanism about its own blindness.

**M5 Postponement Depth** — consecutive deferrals per task; portfolio view = count(tasks depth≥3). Gate: none.

**M6 Overdue Accumulation** — count & median-age of overdue; weekly slope. Interpretation: growing slope = capacity mismatch. Gate: 3 weeks history.

**M7 Context-Switch Rate** — transitions/hour within logged activity, compared to trailing 28d personal baseline (relative z-ish score, not absolute claim). Limitation: log granularity bias — requires ≥2 entries/hr resolution days only. Gate: n≥10 qualifying days.

**M8 Overplanning Ratio** — mean(planned, last 7d) / median(productive-executed hours, trailing 28d **logged days only**). Interpretation: sustained >1.4 = systematic optimism. Gate: 28d history including ≥14 days with any logged activity (unlogged days are missing capacity observations, not zero capacity — remediation B16).

**M9 Under-execution Ratio** — 1 − executed/planned (14d mean). With M8 separates "plans too big" from "execution weak".

**M10 Schedule Reliability** — 14d M1 for behaviors specifically. Gate: n≥10.

**M11 Goal Pace Index** — `observed_velocity / required_velocity` per active measurable goal (§6.3).
Epistemic class: **computed_metric → presented inference**. Rendered as: "Behind pace: need 2.1/wk, averaging 1.3/wk (14d)." Never a fake % confidence. Gate: goal ≥14d old with ≥5 data points.

**M12 Recovery Latency** — median days miss→met. Gate: ≥5 miss episodes. Class: statistical_inference (small-n caution shown).

**M13 Time-of-Day Profile** — focus-minutes & execution-rate by hour bucket (6–9,9–12,…). Gate: **≥3 observations per bucket** else bucket suppressed. Limitation: selection bias (you schedule hard things when you feel good) — stated inline.

**M14 Correlation Explorer (P1)** — Spearman ρ between daily fact series (sleep_hours↔execution_rate, leisure_min↔next-day_rate, etc.).
Gates: paired n≥21; surface only |ρ|≥0.35; display n, ρ, direction, and mandatory caption *"association observed in your logs; not evidence of causation; confounders possible."* Class: correlation.

**M15 Trend Slope (P1)** — Theil–Sen slope on 30–90d series; report direction + per-week magnitude + noise note ("weak signal" if residuals dominate). Gate: n≥20.

**M16 Forecast (P2)** — linear/EWMA extrapolation of cumulative progress with widening band (±2·residual σ). Labeled *prediction, assumes trend continuation*. Never used to trigger celebrations.

**Anti-metric list (banned):** productivity score (single composite), "focus score," gamified percentages without denominator, any metric whose formula can't be shown on tap. Every rendered number long-press/click → formula popover.

---

## 11. Statistical Methodology

1. **Layered derivation**: raw → day facts → metrics → cross-sectional analyses. Each layer versioned via snapshots; conclusions reference snapshot date.
2. **Sample-size gates everywhere** (table above). Default gate failure UI: muted panel, "n=X/Y — keep logging."
3. **Missing ≠ zero**: days with no obligations excluded from adherence means; missing measurements excluded pairwise from correlations. Silent imputation forbidden.
4. **Outliers**: winsorize at 1st/99th pct for means; flag days >3σ as anomalies rather than deleting.
5. **Seasonality**: weekday effects handled by comparing like-to-like (Mon vs Mondays) in trend layer (P1).
6. **Regression to mean guard**: post-anomaly improvements reported with explicit caveat for 14d following anomaly.
7. **Selection/survivorship bias**: profiles (M13) annotate scheduling bias; abandoned goals retained in base rates (not dropped).
8. **Confounds**: correlation view lists top-3 correlated-third-variables among available facts (P2 heuristic); until then, generic confounder disclaimer stands.
9. **Uncertainty language mapping**: n<threshold → "insufficient"; n≥threshold, noisy → "weak signal"; stable → "consistent pattern". No probabilities invented.

---

## 12. Intervention Model

Deterministic rule engine (P1). Structure:

```ts
type Intervention = {
  key: string                    // stable id, e.g. "overplanning_chronic"
  trigger: (facts: DayFacts[], config) => Evidence | null
  severity: 'info'|'warning'
  message: string                // template incl. numbers
  suggested_actions: string[]    // e.g. ["reduce planned load 25%", "split goal"]
  cooldown_hours: number         // per-key
  max_per_day_global: 3
}
```

**Launch ruleset:**

| Key | Trigger | Action offered |
|---|---|---|
| plan_overload | M8>1.4 ∧ 7d | cut tomorrow's plan / rebalance week |
| chronic_deferral | any task depth≥3 | triage: do-today / decompose / drop |
| goal_drift | M11<0.8 ∧ 14d | open goal math; suggest scope cut or behavior boost |
| observability_gap | M4>40% ∧ 5d | launch 3-min retro gap-fill |
| anomaly_evening | today M1<50% of 28d baseline ∧ unflagged | optional reflection prompt |
| recovery_protocol | 2 consecutive misses on a behavior | propose minimum-viable version (e.g., 10-min floor) — framed as evidence-backed re-entry, not pep talk |

**Anti-spam contract:** global cap 3/day, quiet hours (config, default 22:00–08:00), per-key cooldown 72h, dismissal remembered with reason (optional), full `intervention_log` audit. Every intervention renders its triggering evidence inline (numbers, window). User can disable any rule permanently.

Explicitly banned: streak-rescue nagging, guilt copy, variable-reward notifications, emoji-laden alerts.

---

## 13. Data Model

PostgreSQL. All timestamps `timestamptz` (UTC). `local_date` columns are **stored** (derived once at write using device tz) so historical aggregation never shifts on tz changes or DST. IDs: UUIDv7 (time-sortable). Soft delete via `deleted_at` on config entities; **analytical entities (TimeEntry, PlanInstance, Event, Measurement) never hard-delete — they get `voided_at` + amendment chain**.

```sql
users(id pk, email unique, password_hash nullable, webauthn_credentials jsonb,
      totp_secret_enc, timezone text, waking_start time, waking_end time,
      prefs jsonb, created_at, updated_at)

categories(id pk, user_id fk, name, value_class enum, sort int,
           archived_at, created_at, updated_at)
category_history(id, category_id fk, field enum('value_class'), old, new, changed_at)

goals(id pk, user_id, parent_id fk->goals null, title, description,
      horizon enum('life','annual','quarterly'), kind enum('objective','project','milestone'),
      measure_type enum(...§6.2), unit text, target_value numeric, direction enum('at_least','at_most'),
      start_date date, target_date date,
      status enum('draft','active','paused','achieved','abandoned','archived'),
      closed_at, closing_value numeric, sort int, created_at, updated_at, deleted_at)
-- idx(parent_id), idx(status), idx(user_id,status)

behaviors(id pk, user_id, goal_id fk null, category_id fk null,
          title, schedule jsonb, target jsonb, status enum('draft','active','paused','retired'),
          started_on date, created_at, updated_at, deleted_at)

tasks(id pk, user_id, goal_id fk null, behavior_id fk null, title, notes,
      estimate_min int, due_date date, priority smallint,
      status enum('todo','doing','done','cancelled'),
      deferred_count int default 0, last_deferred_at, completed_at,
      created_at, updated_at, deleted_at)
-- idx(status,due_date), partial idx on overdue candidates

plan_instances(id pk, user_id, local_date date NOT NULL,
      ref_type enum('behavior','task'), ref_id uuid, origin enum('schedule','manual','ad_hoc'),
      planned_minutes int null, planned_qty numeric null,
      actual_minutes int null, actual_qty numeric null, met bool null,
      done_at, created_at, updated_at, voided_at null)
-- UNIQUE(user_id, local_date, ref_type, ref_id, origin) where voided_at is null
-- idx(local_date)

time_entries(id pk, user_id, started_at timestamptz, ended_at timestamptz null,
      local_date date, duration_sec int null, -- set on close
      source enum('timer','quick_log','retro','import'),
      task_id fk null, behavior_id fk null, category_id fk null,
      note text, device_id text, auto_closed bool default false,
      amended_by fk->time_entries null, voided_at null,
      client_op_id uuid unique null, -- idempotency
      created_at, updated_at)
-- idx(started_at), idx(user_id, local_date), idx(category_id)

measurements(id pk, user_id, key text,            -- 'sleep_hours','weight_kg',...
      taken_on date, value numeric, source text,
      created_at, updated_at, voided_at null)
-- UNIQUE(user_id,key,taken_on) where voided_at null

events(id pk, user_id, type enum('interruption','distraction','idle','note'),
      occurred_at timestamptz, local_date date, duration_sec int,
      category_id fk null, time_entry_id fk null, note,
      created_at, voided_at null)

reflections(id pk, user_id, local_date date, energy smallint null, content text,
      tags text[], created_at, updated_at, voided_at null)

metric_snapshots(metric_key text, local_date date, value double precision,
      payload jsonb, computed_at timestamptz,
      PRIMARY KEY(metric_key, local_date))

intervention_log(id, user_id, rule_key, fired_at, evidence jsonb,
      disposition enum('shown','dismissed','acted'), meta jsonb)

audit_log(id, actor, action, entity, entity_id, diff jsonb, at timestamptz)

sync_ops(id, user_id, client_op_id unique, op jsonb, received_at)  -- retention 90d
```

**Correction protocol (example):** mis-logged timer → original gets `voided_at`, new corrected row inserted with `amended_by=original.id`. History intact; analytics recompute from live set; snapshots preserve what was believed at the time.

**Indexing summary:** all FKs; hot query paths `(user_id, local_date)`; overdue partial index; unique constraints as listed.

---

## 14. Synchronization Strategy

**Model: server-authoritative, offline-tolerant, single-writer-per-entity-field.**

- Server DB = sole source of truth. Clients hold cache + pending-op queue.
- Writes go through API as commands carrying `client_op_id` (UUID) → idempotent replay-safe.
- Client applies optimistic update immediately; on success replaces with server record (server-assigned `updated_at` = commit order).
- Conflict policy: **last-committer-wins at field granularity for mutable config** (titles, targets — concurrent edits by one human are rare and low-stakes). **Append-only domains (TimeEntry, Events, Measurements, check-ins) cannot conflict** — they're additive; duplicates prevented by `client_op_id`.
- Offline: queue persisted locally (IndexedDB/localStorage); flush on reconnect with exponential backoff; queue UI indicator ("3 changes pending").
- Timer across devices: running timer = row with null `ended_at`; opening on second device shows it read-only + "stop here" (writes stop with server-now). Simple, honest.
- Clock discipline: clients send their timestamp but **server receive-order is canonical**; skew >5min surfaces a settings warning (bad clocks poison ordering).
- Timezone: per-entry `local_date` frozen at creation (device tz); user travel → day boundaries follow the tz *at time of logging* (correct behavior for a diary model); profile tz change affects only future defaults. DST handled implicitly by storing UTC instants.
- Backups: nightly `pg_dump` → encrypted offsite (script in repo, cron/Vercel cron); restore runbook documented. Export endpoint gives user independent copy anytime.

Native-app-grade sync (CRDT/Automerge) explicitly rejected for v1: N=1 makes conflicts rare; complexity budget better spent on analytics correctness. Upgrade path preserved (ops log ≈ event journal).

---

## 15. Security & Privacy Architecture

| Concern | Decision |
|---|---|
| Auth | Single account. Bootstrap via one-time setup token (env). Auth: email+password(argon2)+TOTP **or** WebAuthn passkey [USER DECISION REQUIRED]. Session: httpOnly, Secure, SameSite=Lax cookies, 30d sliding, revocable list in Settings. |
| Rate limiting | Auth endpoints: 5/min/IP + progressive lockout. |
| Headers | CSP (self + charts lib), HSTS, X-Frame-Options DENY, Referrer-Policy strict-origin. |
| DB | Least-privilege app role (no superuser). If Supabase: RLS deny-all for anon/authenticated except service role used server-side only. |
| Secrets | Env-only, never in repo. `.env.example` documents shape. |
| Encryption | TLS in transit; provider encryption at rest. Field-level encryption for reflection content = P2 opt-in. |
| Privacy posture | No third-party analytics/trackers/error-reporters in client. Server logs scrubbed of note/reflection payloads. |
| Export | `/api/export` full JSON (all tables) + per-entity CSV (P1). Signed, expiring download. |
| Deletion | Settings → "Delete everything": cascading hard delete + tombstone rows in audit_log (no payload). Backup purge documented (next nightly cycle). |
| Auditability | audit_log for auth events, exports, destructive ops. |
| Self-host | Docker-compose profile maintained from day one so the user can exit managed hosting [ties to §16 decision]. |

---

## 16. Technology Architecture

### Options considered

| Axis | A: Next.js monolith + Supabase PG | B: Tauri desktop + local SQLite + sync server | C: Flutter native + Firebase |
|---|---|---|---|
| Time-to-P0 (12h) | ✅ best (one codebase, deploy included) | ❌ desktop-first; mobile shell later | ⚠️ fast UI, weak analytics/testing story |
| Laptop+mobile sync | ✅ inherent (web) | ⚠️ must build sync protocol | ✅ inherent |
| Analytics/test rigor | ✅ TS metric core + Vitest | ✅ | ⚠️ Dart test fine, fewer libs |
| Offline | ⚠️ queue-based (adequate) | ✅ best | ✅ |
| Data ownership/self-host | ✅ Supabase dump + docker alt | ✅ fully local | ❌ vendor lock-in |
| Risk | PWA limits on mobile (minor here) | two clients to build | lock-in, weaker SQL |

### Decision: **Option A**, with escape hatches.

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript strict, Tailwind CSS, TanStack Query (server-state + retry/offline queue hooks), Recharts (charts), `react-hook-form`+`zod` (validation shared client/server).
- **Backend:** Next.js route handlers (monolith). Service layer (`src/server/services/*`) kept framework-agnostic so a future extraction is mechanical. Prisma ORM + migrations.
- **DB:** PostgreSQL — Supabase managed initially (auth option, RLS, backups) **or** self-host docker-compose [USER DECISION REQUIRED].
- **Metric core:** `src/lib/metrics/*` — pure functions over typed day-fact arrays. Zero IO. Highest test coverage in repo. Snapshot job calls it; UI calls it directly for today.
- **Jobs:** Vercel Cron (nightly snapshot + backup trigger) with manual "recompute" button in Settings.
- **Testing:** Vitest (metrics: golden fixtures + property tests), integration tests vs throwaway PG (testcontainers or supabase branch), Playwright smoke E2E.
- **Observability:** structured JSON logs (pino), request-id propagation, `/api/health`. External APM deliberately absent (privacy principle) — local log tail instead.
- **Deployment:** Vercel + Supabase (managed) or single VPS docker-compose (app+pg+caddy). Both supported by same env contract.

Rejected-for-now notes: NestJS (ceremony > value at this size), GraphQL (REST/zod sufficient, N=1), Electron (heavier than needed), Redis (no scale need).

---

## 17. Prioritization

### P0 — the 12-hour build (must ship usable + trustworthy)
1. Schema + migrations + seed (categories, sample goal tree)
2. Auth (password+TOTP), session mgmt, rate limit
3. Entities CRUD API: goals(tree, subset: binary/quantity/duration/deadline), behaviors(weekly/daily), tasks(+defer), categories, time_entries(timer/quick-log), plan_instances generation
4. Metric core v1: M1,M2,M3,M4,M5,M6,M8,M9,M11 + gates
5. UI: shell/nav, Today dashboard (full widget set), Behaviors check-in, Tasks board, Goals tree + detail, Timeline day-view (read), Settings (tz, waking hours, categories, export JSON)
6. Offline write queue (basic) + pending indicator
7. Nightly snapshot job + recompute button
8. Tests: metric goldens, API happy-path, E2E smoke (log→dashboard reflects)
9. Deploy + backup script + runbook README

### P1 — immediately after (weeks 1–2)
Measurements + correlation explorer(M14) + trend(M15) · interventions engine (§12 six rules) · reflections + Journal · retro gap-fill UX · CSV export/import · time-of-day profile · recovery/volatility metrics · PWA install polish + iOS safe-area/passive timer care · automated backup verification · category value-class versioning UI

### P2 — advanced
Forecasting(M16) · sequence/pattern mining (pre-failure activity chains) · calendar & screen-time import · environment/context tags · routines (ordered behavior groups) · field-level encryption toggle · constraint modeling (schedule exceptions) · plugin/query API for personal notebooks · native mobile shells if PWA proves limiting

---

## 18. 12-Hour Implementation Plan

| Window | Deliverable | Exit check |
|---|---|---|
| H00–00.5 | Repo init, git, scaffold Next.js+TS+Tailwind, Prisma init, lint/format, CI-less scripts | `pnpm dev` green, schema file drafted |
| H00.5–02 | Full migration v1 (all P0 tables), seed script, auth (credentials+TOTP), middleware guard | Login works; unauthorized → redirect; seeded demo data visible via psql |
| H02–04 | Services + REST APIs: categories, goals, behaviors, tasks, plan_instances (auto-gen for ±7d), time_entries (start/stop/log/void+amend) | curl suite passes; idempotency verified on replay |
| H04–05 | Metric core v1 + golden tests (fixtures: perfect week, lazy week, chaotic week) | All metric tests green incl. gate/insufficient-data branches |
| H05–07.5 | App shell + Today dashboard + capture bar (timer, quick-log modal, check-in strip, defer buttons) + flags row | E2E: start timer→stop→dashboard variance updates |
| H07.5–09 | Pages: Behaviors (+check-in history heat-strip), Tasks (today/overdue/inbox), Goals tree + detail with pace panel | CRUD flows pass E2E |
| H09–10 | Timeline day view (blocks vs entries vs gaps), Week mini-view, Analytics page v1 with gates + formula popovers | Numbers match metric-test fixtures |
| H10–10.5 | Settings: tz/waking hours/categories editor/threshold defaults/export JSON; snapshot cron + recompute | Export round-trips; recompute idempotent |
| H10.5–11.5 | Offline queue wiring + pending badge; empty/error/loading states sweep; mobile layout pass | Airplane-mode log syncs on reconnect |
| H11.5–12 | Deploy (Vercel+Supabase), backup script, README runbook, final E2E against prod | Acceptance criteria §20 checked |

Buffer policy: if behind at H07, cut Timeline week-view and Analytics charts to gated tables (never cut tests or export).

---

## 19. Testing Strategy

| Layer | Tool | Coverage target | Key cases |
|---|---|---|---|
| Metric core | Vitest | ~100% | Golden fixtures (perfect/lazy/chaotic/gap-ridden months); property tests: sums invariant to entry order; gates return insufficient-data; direction=at_most inversion; DST/tz boundary days |
| Services/API | Vitest + ephemeral PG | happy paths + authz (401/403) + idempotent replays + void/amend chain integrity | defer increments exactly once; timer auto-close; unique plan instance |
| Sync/offline | Vitest + fake timers | queue flush order, dedupe by client_op_id, conflict field-LWW | replay storm of 50 queued ops |
| E2E | Playwright | critical loops | login→define behavior→check in→log time→dashboard reflects→export contains row |
| Manual QA checklist | docs/QA.md | release gate | mobile Safari/Android Chrome spot checks; tz travel simulation (shift device tz, verify local_date freezing) |

Definition of done per feature: code + tests + gates honored + epistemic labels correct + no console errors + keyboard reachable.

---

## 20. Acceptance Criteria (release gate for P0)

- AC1 Scheduled behavior auto-appears in tomorrow's plan and Today list.
- AC2 Timer survives refresh/device switch; stopping writes exact UTC instants; local_date correct across midnight.
- AC3 Deferring a task 3× triggers postponement flag with evidence numbers.
- AC4 Execution-rate on seeded fixture matches hand-computed value to 0.01.
- AC5 Unknown-time share displays correctly and degrades other panels' confidence when >60%.
- AC6 Behind-pace goal shows required vs observed velocity with both raw numbers.
- AC7 Any metric below its gate renders "Insufficient data (n=X/Y)" — never a fabricated value.
- AC8 Unauthenticated request to any API → 401; UI redirects to login; rate limit trips after 5 bad attempts/min.
- AC9 Deleting (archiving) a category preserves historical entries' attribution via archived reference.
- AC10 Correcting a time entry leaves original retrievable (void+amend) and recomputes affected metrics only forward.
- AC11 Airplane-mode quick-log queues, syncs on reconnect, no duplicates (client_op_id).
- AC12 Full JSON export imports-parse cleanly and contains every entity type with counts matching UI.
- AC13 p95 Today-dashboard TTFB <1.5s with 90 days seeded data.
- AC14 Zero third-party network calls from the client bundle (verified by network log inspection).
- AC15 Formula popover available on every displayed metric.

---

## 21. Major Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Scope explosion** — building the whole catalog | misses 12h | Hard P0 list; buffer policy §18; P1 features physically separated in module structure |
| R2 | **Logging friction → data abandonment** | system starves (worst outcome) | Capture-bar-first UI; <10s paths; unknown-time framing removes guilt of imperfect logs |
| R3 | Correlation misinterpretation by user | false beliefs | Mandatory captions, gates, non-causal language (P-4, M14) |
| R4 | Timezone/DST bugs corrupt day aggregation | wrong analytics, trust loss | Stored local_date at write; fixture tests crossing DST; travel sim in QA |
| R5 | Repo lives in OneDrive-synced folder | file locks / sync conflicts on runtime artifacts | Git VCS fine; **never place SQLite/db dumps/node_modules-sensitive state expectations there**; .gitignore strict; consider relocating repo out of OneDrive (recommendation, not blocker) |
| R6 | Supabase free-tier pauses / vendor changes | outage | Docker-compose parity path; nightly dumps owned by user |
| R7 | PWA mobile limitations (background timer, push) | UX gaps | Elapsed-on-read timer design immune to background kill; push deferred (in-app flags suffice P0) |
| R8 | Single-developer bus factor = data orphaned | permanent loss | Export-from-day-one, plain SQL schema, documented restore runbook |
| R9 | Perfectionism on UI polish | time sink | Design language locked (calm/dense/neutral); no bespoke illustrations ever |

---

## 22. Unknowns Requiring Clarification

Defaults chosen where defensible; items marked need the principal's answer before or during build (none block H00–04):

| # | Decision | Proposed default |
|---|---|---|
| U1 | **[USER DECISION REQUIRED]** Hosting: managed cloud (Supabase+Vercel, fastest) vs self-hosted VPS/docker (max ownership) | Managed cloud for 12h build; compose files shipped either way |
| U2 | **[USER DECISION REQUIRED]** Auth method: password+TOTP vs hardware/passkey | Password+TOTP P0, passkey added P1 |
| U3 | **[USER DECISION REQUIRED]** Mobile form factor acceptance: responsive PWA now vs native later | PWA now; revisit after 4 weeks real usage |
| U4 | Your real category taxonomy + waking hours (defaults seeded: 07:00–23:00) | Editable in Settings day one |
| U5 | Data retention horizon | Forever (snapshots make this cheap) |
| U6 | Passive imports priority (calendar? phone screen time?) | P2 assumed |
| U7 | Travel frequency/timezone hopping | Diary-model handles it; confirm if frequent intl. travel needs per-entry tz picker P1 |
| U8 | Language/locale formatting (dates, first day of week) | en-US, Monday-first charts |
| U9 | Existing data to import? | None assumed |

---

### Sign-off

Discovery phase complete. All 22 deliverables produced. Implementation will proceed against §17 P0 and §18 plan upon confirmation of U1–U3 (or explicit instruction to proceed with defaults).

**Next phase entry command:** "Proceed with defaults" or answer U1–U3.

---

## Appendix A — Implementation amendments (Phase 1)

Decisions taken during the P0 build that adjust this document. All are additive or documented-convention changes; none weaken product principles.

| # | Amendment | Rationale |
|---|---|---|
| A1 | `goals.current_value` column added (§13) | §6.2 quantity goals specify "manual updates" as a progress source; without a current-value store there is nowhere honest to record one. |
| A2 | `sessions` table added (§15 implied) | Revocable session list requires persistence; token hash stored, raw token never. |
| A3 | Partial unique indexes shipped as raw-SQL migration | Prisma DDL cannot express `WHERE voided_at IS NULL` uniqueness (plan_instances, measurements). Enforced in migration `…_partial_unique`. |
| A4 | Missing day-facts persisted as `-1` with `payload.missing=true` in snapshots | Snapshot value column is non-null Float; sentinel keeps "no observation" distinct from zero (P-3), consumers treat `<0` as missing. |
| A5 | `times_per_week` schedules generate no concrete-day plans | Any generated anchor day would be fiction; executions log ad-hoc and count toward weeklyMin (P1 view). Documented in UI. |
| A6 | Wall-clock↔UTC ambiguity conventions fixed & tested | Fold → FIRST occurrence (earlier instant); Gap → resolve forward one hour (moment-timezone convention). See `src/lib/metrics/dates.ts`. |
| A7 | CSP permits `'unsafe-eval'` only when NODE_ENV≠production | React Fast Refresh/HMR needs eval; production headers remain strict per §15. |
| A8 | M6 overdue series computed historically by snapshot job (`overdue_count`) | Weekly slope needs retroactive counts; derived from task due/completion lifecycle, not fabricated. |
| A9 | Timer `stop` accepts a client-captured stop instant with server-side skew bounds (>60s flagged via audit, >5min rejected) and frozen start-day attribution | Offline queue delays delivery; without the carried instant, durations silently inflated (Phase-2 finding C6). Server remains authoritative/validating. |
| A10 | Idempotency uses reservation rows with a 120s TTL takeover + delete-on-handler-failure | Guarantees no permanently wedged op after a crash between reserve and respond (C4), without new infrastructure. Concurrent duplicates receive transient 409 `op_in_flight`; clients treat it as retryable. |
| A11 | Bootstrap POST doubles as pre-confirmation secret recovery (token-gated, rate-limited); confirmed accounts can never re-enter | Removes the lost-secret brick path (C5) without weakening the single-account invariant. |
| A12 | Confidence meta-gate is a typed discriminated union (`observed \| insufficient`) that fails closed | Sentinel numbers could masquerade as healthy shares (C3). Insufficient data now always degrades confidence. |
| A13 | `tasks.completed_local_date` column added; completion day frozen at transition | Read-time derivation under changing profile tz could rewrite history (C9). Legacy null rows fall back to documented derivation. |
| A14 | Facts-layer executed-planned clamp removed | Architecture formulas for M3/M9 imply symmetric variance; the clamp made overshoot structurally invisible while metadata claimed otherwise (C10). Overshoot is now representable and truthful. |
| A15 | Work/Tasks bucketing requires a resolved local date; overdue predicate is unconditional | The optional-date path produced an "Overdue" bucket containing all open tasks (C1). |
| A16 | Production self-host parity shipped for real: standalone Next output + Dockerfile (deps/build/migrator/runner) + docker-compose.prod.yml with one-shot migrate service | §15 promised compose "from day one"; Phase-2 audit found it missing. |
| A17 | `sync_ops` 90-day retention implemented in the nightly snapshot job; prunes only completed ops | §14 retention was specified but unimplemented; response-less reservations are never pruned so client queues can always resolve. |
