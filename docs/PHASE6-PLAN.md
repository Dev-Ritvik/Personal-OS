# PERSONAL MODEL V1 — IMPLEMENTATION PLAN
## Phase 6: From Measurement Engine to Personalized Operating System

**Status:** Discovery complete. Existing P0 foundation verified.
**Date:** 2026-08-26
**Scope:** Personalization layer ONLY — P0 foundation untouched.

---

## 0. INSPECTION SUMMARY

### Existing P0 Entities (VERIFIED - DO NOT DUPLICATE)
| Entity | Location | Purpose | Personal Model Action |
|---|---|---|---|
| `User` | `prisma/schema.prisma:117` + `src/server/auth/*` | Auth + prefs + timezone | **EXTEND** via `PersonalProfile` 1:1, do not alter User table |
| `Goal` | `src/server/services/goals.ts` | Hierarchy (life→annual→quarterly) + measure types | **AUGMENT** with goal-skill links, dependency edges; no schema change to Goal itself |
| `Behavior` | `src/server/services/behaviors.ts` | Recurring actions + schedule/target | **AUGMENT** with behavior-skill practice links |
| `Task` | `src/server/services/tasks.ts` | One-off work + deferral tracking | **AUGMENT** with task-skill mapping |
| `PlanInstance` | `src/server/services/plans.ts` | Planned vs actual day ledger | No change |
| `TimeEntry` | `src/server/services/timeEntries.ts` | Timer + quick-log, frozen local_date | No change |
| `Category` | `src/server/services/categories.ts` | Time taxonomy + value_class | No change |
| `MetricSnapshot` | `src/server/services/snapshot.ts` | Day-fact snapshots | No change |
| `Measurement` | schema `measurements` | Free-form daily numeric series | No change (future: sleep_hours etc.) |
| `Event` / `Reflection` | schema `events`/`reflections` | Interruptions, daily notes | No change |

### Existing Infrastructure (VERIFIED)
| Layer | Location | Personal Model Reuse |
|---|---|---|
| Metric core | `src/lib/metrics/*` + `src/lib/goals/progress.ts` | Unchanged; goals continue computing progress via pure functions |
| Time helpers | `src/lib/metrics/dates.ts` (todayInTz, localDateInTz) | Reused for diary-date correctness |
| Schedule | `src/lib/schedule.ts` | Reused |
| Auth/session | `src/server/auth/*`, `src/server/api.ts:requireSession` | All new APIs will use `requireSession` + userId scoping |
| Offline queue | `src/lib/client/api.ts` | No change needed |
| Today assembly | `src/server/services/today.ts` | **EXTEND** to include command brief inputs; no breaking change to existing payload |
| Export/deletion | `src/server/services/exportService.ts`, `deletion.ts` | Will extend to include new personal-model entities |
| UI shell | `src/components/AppShell.tsx` | Add nav entries only |
| MetricTile | `src/components/MetricTile.tsx` | Reused for skill/capacity metrics where applicable |

### Gap Analysis
| Required Concept (§6–§24) | Existing Coverage | Action |
|---|---|---|
| Identity/context (§6A, §31 seed) | Partial (User.email/timezone) | New `PersonalProfile` |
| Current vs Target state (§7) | Missing | New `StateItem` (+ enum `StateKind`) |
| Skills (§8–§11) | Missing | New `Skill`, `SkillDependency`, `SkillEvidence`, `GoalSkillLink` |
| Behavioral patterns (§12) | Missing (only raw deferral facts) | New `BehavioralPattern` (derived, not moral) |
| Capacity (§13) | Partial (M3/M8/M9 exist) | New `CapacitySnapshot` optional; initially computed on-the-fly |
| Financial (§4, §22) | Missing | New `FinancialAccount`, `FinancialEntry`, `SavingsGoal` |
| International trajectory (§2, §10, §20) | Missing | Encoded as target-state items + skill dependencies + goal graph (no extra table) |
| Readiness (§20) | Missing | New `ReadinessDimension` + derived `ReadinessStatus` (computed) |
| Reviews (§23) | Missing | Defer to future; `PersonalModelReview` stub only |
| Personalization (rules) | Missing | New pure `src/lib/personal/*` modules |

---

## 1. SCHEMA DESIGN (Phase A)

### 1.1 New enums

```prisma
enum SkillLevel { UNKNOWN BEGINNER DEVELOPING FUNCTIONAL STRONG ADVANCED }
enum SkillCategory { TECHNICAL COMMUNICATION BUSINESS CAREER INDEPENDENT_LIVING PERSONAL_PERFORMANCE INTERNATIONAL }
enum SkillStatus { ACTIVE ARCHIVED }
enum EvidenceClass { FACT SELF_REPORT INFERENCE ASSESSMENT }
enum StateKind { CURRENT TARGET }
enum ReadinessStatus { UNKNOWN FOUNDATIONAL DEVELOPING READY BLOCKED }
enum FinancialEntryType { INCOME EXPENSE }
enum PersonalModelReviewKind { DAILY WEEKLY MONTHLY QUARTERLY TRANSITION }
```

### 1.2 New models (all user-scoped, FK → users, proper indexes)

```
PersonalProfile
  id PK, userId UNIQUE FK, displayName, location, education, academicYear,
  currentCgpa Decimal?, targetCgpa Decimal?, classSchedule Json, bestWorkWindow, worstWorkWindow,
  sleepWindow Json, sleepInconsistency Int?, preferences Json (trackingImportance map),
  constraints Json, createdAt, updatedAt

StateItem          (CurrentStateItem + TargetStateItem unified)
  id PK, userId FK, kind enum(StateKind), domain String, label String, value String, sort Int
  // domain examples: "academic", "routine", "location", "project", "capability"
  @@index([userId, kind])

Skill
  id PK, userId FK, name String, category SkillCategory, description String?,
  currentLevel SkillLevel @default(UNKNOWN), targetLevel SkillLevel @default(FUNCTIONAL),
  importance Int @default(2), // 1-3
  status SkillStatus @default(ACTIVE),
  lastAssessedAt DateTime?, nextReviewAt DateTime?,
  sort Int, createdAt, updatedAt, archivedAt?
  @@index([userId, category]), @@index([userId, status]), @@unique([userId, name])

SkillDependency
  id PK, userId FK, skillId FK -> Skill, dependsOnSkillId FK -> Skill
  // A → B means "A depends on B"
  @@unique([skillId, dependsOnSkillId]), @@index([dependsOnSkillId])

SkillEvidence
  id PK, userId FK, skillId FK -> Skill,
  title String, description String?, epistemicClass EvidenceClass,
  sourceType String?, sourceId String?, // optional link to task/goal/behavior
  assessedLevel SkillLevel?, createdAt
  @@index([skillId]), @@index([userId, skillId])

GoalSkillLink
  id PK, userId FK, goalId FK -> Goal, skillId FK -> Skill
  // Goal requires skill at a given minimum level for progress
  requiredLevel SkillLevel?, notes String?
  @@unique([goalId, skillId]), @@index([skillId]), @@index([goalId])

TargetStateRequirement   (reifies November 2027 lifestyle → required capabilities)
  id PK, userId FK, dimension String, // e.g. "living_cooking"
  requirement String, // "Cook breakfast independently"
  requiredSkills String[] (skill name list, denormalized for fast UI),
  requiredGoals String[] (goal title list, denormalized),
  sort Int
  @@index([userId, dimension])

FinancialAccount  (single logical account for V1; extensible)
  id PK, userId UNIQUE FK, currency String @default("INR"), createdAt

FinancialEntry
  id PK, userId FK, accountId FK, kind FinancialEntryType,
  amount Decimal, occurredOn Date @db.Date, category String?, note String?,
  linkedGoalId FK? -> Goal, createdAt
  @@index([userId, kind, occurredOn]), @@index([accountId])

SavingsGoal
  id PK, userId FK, accountId FK, title String, targetAmount Decimal,
  targetDate Date? @db.Date, status String @default("active"), // active|achieved|abandoned
  createdAt
  @@index([userId, status])

ReadinessDimension   (8-9 Poland-readiness buckets, seeded; evidence-computed)
  id PK, userId FK, key String, // "academic" | "technical" | ...
  label String, description String?, sort Int
  @@unique([userId, key])

ReadinessRequirement
  id PK, userId FK, dimensionId FK -> ReadinessDimension, label String,
  // how to evaluate: skillId, goalId, or manual check
  skillId FK? -> Skill, goalId FK? -> Goal,
  // e.g. "CGPA ≥ 8.0" or "QHR delivered Nov 1 2026"
  evidenceSummary String?, // last computed, not authoritative
  @@index([dimensionId])
```

### 1.3 Notes on what is NOT added
- No giant `personal_model` JSON blob (§6, §24 satisfied).
- No `CapacitySnapshot` table yet — capacity remains derived from existing snapshots + new on-the-fly calc (introducing a snapshot later is non-breaking).
- No `BehavioralPattern` table yet — patterns are derived deterministically from existing metric facts (M3/M5/M8 + deferral + unknown share); materializing is P1.
- No `Review` table yet — stub types only; persistence deferred.
- `PersonalProfile.preferences` stores the 15 trackingImportance values as JSON `Record<string, 1|2|3>`.

### 1.4 Migrations
- One migration: `personal_model_v1` — all new tables + enums. No alteration to existing tables (backward-compatible).
- Existing seed (`scripts/seed.mjs`) untouched; new seed is `scripts/seed-personal-model.mjs` (idempotent by natural keys).

---

## 2. SEED DATA (Phase B)

### 2.1 PersonalProfile (one row)
Derived ONLY from §31 "Known facts":

```
displayName: Dev Ritvik (from repo URL)
location: LPU hostel, Jalandhar, Punjab, India
education: B.Tech CSE — AI & ML
academicYear: 2nd year, 1st semester
currentCgpa: 7.5, targetCgpa: 8.0
classSchedule: { Mon:11-17, Tue:11-17, Wed:11-17, Thu:09-17, Fri:11-17 }
bestWorkWindow: early_morning, worstWorkWindow: unpredictable
sleepWindow: { bed~22:00, wake~07:00 }, sleepInconsistency: 8
constraints: []
preferences.trackingImportance: { study:3, coding:1, business:3, fitness:2, sleep:1, food:2, money:3, social:2, family:2, mood:1, reading:3, gaming:2, entertainment:2, personalProjects:3, discipline:3 }
```

### 2.2 CurrentState items (5–6) and TargetState items (9–10), e.g.:

```
Current:  CGPA≈7.5 | Early-morning peak, inconsistent routines | Instagram/doomscrolling distraction | LPU classes Mon-Fri | QHR-Ecosystem active (due Nov 1 2026) | Hostel living (meals not self-managed)
Target:   CGPA≥8.0 | Stable 07:00 wake → gym → cook → groom → classes | Independent cooking/household | WUST student | Remote job (high-paying, covers living) | Reading 10 pages/night | Poland Nov 2027 | Erasmus/KTH pathway
```

Visually separated in UI — never co-mingled as fact.

### 2.3 Goals (re-uses existing Goal table; no new goal-model)

Seed/reconcile under the single life-objective if absent, otherwise attach:

```
G1  QHR-Ecosystem — finish CRM+3D/WebGL delivery, tested, due 2026-11-01 (project, deadline 1 unit)
G2  Q1 Scopus — AI systems & foundations (project, binary)
G3  WUST 2+2 / transfer eligibility (objective, binary; targetDate 2027-09-01)
G4  Remote-job prerequisites (objective, binary)
G5  Earn ₹5L before Poland (SavingsGoal linked; also Goal as quantity 500000 INR, at_least)
G6  CGPA ≥ 8.0 (quantity 8.0, at_least, start 7.5)
G7  KTH exchange capability (future, draft)
G8  Poland living: earn/cover/save/invest (draft)
G9  Master's NL/DE/CH (draft)
G10 Long-term settle NO/NL (draft)
```

Only G1–G6 are active initially; G7–G10 are `draft` (visible but not driving daily recommendations).

### 2.4 Skills — 78 rows from §9 taxonomy

Each gets: category, name==label, UNKNOWN currentLevel, sensible targetLevel (most FUNCTIONAL; a few STRONG where portfolio-facing: Technical research, Scientific writing, etc.), importance 2 default (personal performance + business closing + research skills bumped to 3 where they back active goals).

Example targetLevel bumps to STRONG: Technical research, Scientific writing, Presentation, Proposal writing, Negotiation, Portfolio.

Dependencies (§10) — 18 edges seeded:

```
Spoken English -> Professional communication -> Technical communication
Technical communication -> Presentation -> {Research presentation}
Research presentation -> Scientific methodology -> Technical research
Technical research -> Scientific writing
Sales -> Discovery -> Needs analysis -> Proposal writing -> Negotiation -> Client communication
Client communication -> Client management -> Business operations
Cooking -> Meal planning -> Grocery management -> Budgeting -> Household management
Household management -> Poland readiness (capability chain)
Resume/CV -> Portfolio -> Technical interviewing -> Networking -> Remote work
Planning -> Prioritization -> Time estimation -> Focus -> Procrastination control
Digital distraction control -> Focus
Sleep consistency -> Routine adherence
Exercise consistency -> Routine adherence
Cultural adaptability -> Intercultural communication -> Professional etiquette across cultures
```

### 2.5 Goal↔Skill links — ~22 edges

```
G1 QHR → Software engineering, System design, Databases, APIs, Testing, Debugging, Client communication, Project management
G2 Q1 paper → Technical research, Scientific methodology, Scientific writing, Technical reading, Statistics, Presentation
G5 ₹5L → Sales, Proposal writing, Negotiation, Lead generation, Client retention, Pricing
G3/G7 WUST/KTH → Spoken English, Technical communication, Presentation, Resume/CV, Portfolio, Networking
G6 CGPA → Planning, Time estimation, Focus, Routine adherence, Technical reading
Poland readiness (dimensions) → Cooking/Meal planning/Household/Budgeting/Cultural adaptability/Living abroad
```

### 2.6 Readiness dimensions (8) — seeded empty, computed later:

```
academic, technical, career, financial, independent_living, communication, international, physical_routine
(+ administrative derived from Bureaucracy navigation)
```

### 2.7 SavingsGoal

```
title: Pre-Poland earnings — ₹5L
targetAmount: 500000, currency: INR, targetDate: 2027-09-01
```

### 2.8 Explicitly NOT seeded (must remain empty/unknown until evidence arrives)

No income/expense rows, no skill evidence, no body measurements, no grades by subject, no WUST eligibility assessment, no salary estimate.

---

## 3. SERVICES + APIs (Phase C)

### 3.1 New service modules

```
src/server/services/personalProfile.ts   getOrCreate, update, get
src/server/services/stateItems.ts        list(CURRENT|TARGET), create, update, delete
src/server/services/skills.ts            list, get, create, update, archive, dependencies
src/server/services/skillEvidence.ts     list/create for a skill, history
src/server/services/goalSkills.ts        link/unlink, listByGoal, listBySkill
src/server/services/readiness.ts         computeReadiness(userId) → per-dimension status + missing
src/server/services/financials.ts        account getOrCreate, entries CRUD, savingsGoals CRUD, summary
src/server/services/personalization.ts   pure recommendation engine (see §5)
```

All services: `requireSession` upstream; `userId` first arg; ownership-scoped queries; append-style history for `SkillEvidence` (never update).

### 3.2 New API routes (all authenticated, Zod-validated, user-scoped)

```
GET    /api/personal/profile
PATCH  /api/personal/profile
GET    /api/personal/state?kind=CURRENT|TARGET
POST   /api/personal/state
PATCH  /api/personal/state/[id]
DELETE /api/personal/state/[id]

GET    /api/skills?category=&status=ACTIVE
POST   /api/skills
GET    /api/skills/[id]
PATCH  /api/skills/[id]
GET    /api/skills/[id]/evidence
POST   /api/skills/[id]/evidence        { title, description?, epistemicClass, assessedLevel? }
GET    /api/skills/[id]/dependencies
POST   /api/skills/dependencies         { skillId, dependsOnSkillId }
DELETE /api/skills/dependencies/[id]

GET    /api/goals/[goalId]/skills       (goal → required skills)
POST   /api/goals/[goalId]/skills       { skillId, requiredLevel?, notes? }
DELETE /api/goals/[goalId]/skills/[skillId]

POST   /api/tasks/[taskId]/skills       { skillIds: string[] }  (task → practiced skills)
GET    /api/tasks/[taskId]/skills

GET    /api/readiness                   (computed, no POST — dimensions seeded)
GET    /api/readiness/[dimensionKey]

GET    /api/financials/summary          (totals, savingsRate, runway — null when insufficient)
GET    /api/financials/entries?kind=&from=&to=
POST   /api/financials/entries
PATCH  /api/financials/entries/[id]
DELETE /api/financials/entries/[id]
GET    /api/financials/goals
POST   /api/financials/goals
PATCH  /api/financials/goals/[id]

GET    /api/personal/recommendations    (wraps personalization engine; query ?today=&tz=)
```

### 3.3 Existing APIs touched (compatibly)

- `src/server/services/exportService.ts`: include new entities in export.
- `src/server/services/deletion.ts`: wipe new entities in correct FK order.

---

## 4. PERSONALIZATION ENGINE (Phase C, pure)

`src/lib/personal/recommendations.ts` — deterministic, rule-based only.

**Inputs:** active goals (with deadlines/progress), tasks (overdue/today/inbox + deferredCount), behaviors (adherence), metric facts (M1/M8/M9), skills needing evidence, savingsGoal progress, readiness computed view, current time + diary `today`.

**Outputs:** typed `Recommendation[] { kind, title, reason, evidence, confidence, recommendedAction }`

Initial rule set (each gated):

| Rule | Trigger | Confidence |
|---|---|---|
| Deadline risk | Goals with targetDate ≤30d and progress < required | HIGH if close, else MEDIUM |
| Overplanning | M8>1.4 | MEDIUM (depends on M8 gate) |
| Deferral pattern | chronicCount>0 | HIGH |
| Stale skill evidence | skills with `nextReviewAt < today` or `UNKNOWN` backing an active goal | LOW–MEDIUM |
| Readiness blocker | Any dimension BLOCKED/FOUNDATIONAL where required skill UNKNOWN and linked goal active | MEDIUM |
| Financial trajectory (informational) | SavingsGoal targetDate exists but <3 income entries | LOW + explicit insufficient-data note |
| Insufficient-data guard | Any rule whose inputs fail metric gates | Returns `insufficient` card instead of a recommendation |

No LLM, no fake certainty, every emitted recommendation carries its cited inputs.

---

## 5. UI (Phase D–H)

### 5.1 Navigation

Add to `AppShell` nav:

```
/profile        Personal Model overview (Current vs Target, constraints, preferences)
/skills         Taxonomy browser by category + search
/skills/[id]    Skill detail + evidence timeline + dependency graph slice
/readiness      Poland readiness by dimension (status, missing, next action)
/financials     Ledger + savings progress + summary metrics
```

Keep existing nav order; new entries grouped under a subtle divider ("Personal Model").

### 5.2 Page briefs

- **/profile** — identity/context card + CurrentState panel + TargetState panel (two columns, never merged) + tracking-importance matrix + class-schedule summary. Read-only seed display + inline edit for profile fields.

- **/skills** — category filter bar (chips), search, table/card list showing `{name, category, current→target, importance, status}`. UNKNOWN levels rendered as muted “no evidence” rather than a number; nothing looks like a game level.

- **/skills/[id]** — header (name, category, levels, importance), dependency mini-graph (dependsOn + dependedOnBy), evidence timeline (newest first, with epistemic class chips), linked goals/tasks inline, “Add evidence” form.

- **/readiness** — dimension cards `{status chip, missing requirements list, next action}`. Status computed via `computeReadiness` (separate spec §4). Not a single gamified percentage.

- **/financials** — summary row (income/expense/savings/savingsRate/runway, each metric-gated), savings-goal progress bars (only when entries exist), ledger table with inline add.

- **/today** — augment existing dashboard with a **Command Brief** slot above the fold: 1–3 highest-value recommendations from the personalization engine, each showing reason + evidence + confidence. Non-overwhelming; empty state when insufficient data.

- **/goals** — goal detail page adds a “Required skills” section (read from `GoalSkillLink`); create/edit goal flows gain an optional skill-link step (does not block).

- **/analytics** — add a “Personal model” subsection: skill coverage by category (counts, not scores) + readiness overview sparkline — minimal, no new metric types.

All pages reuse `MetricTile` epistemic pattern where numbers appear.

---

## 6. TEST PLAN (Phase I)

### 6.1 Unit (pure)

| File | Cases |
|---|---|
| `src/lib/personal/recommendations.test.ts` | deadline risk, overplanning gate, deferral, stale-skill, readiness blocker, insufficient-data guard, unknown-target never blocks, evidence vs inference separation |
| `src/lib/personal/readiness.test.ts` | UNKNOWN→BLOCKED, FOUNDATIONAL threshold, DEVELOPING, READY, multi-requirement aggregation, empty-skills safe |

### 6.2 Integration (DB, isolated test DB via `setup-env.ts`)

| Suite | Cases |
|---|---|
| `tests/integration/personal-model.test.ts` | profile CRUD, current/target separation & auth scoping, state-item CRUD, skill CRUD (natural-key uniqueness), dependency cycle guard, dependency auth, skill evidence append+history, goal↔skill link/unlink, task↔skill mapping |
| `tests/integration/readiness.test.ts` | seeded dimensions present, status transitions as skills/goals advance, unknown goal blocks readiness |
| `tests/integration/financials.test.ts` | entry CRUD, summary math (savings, rate, runway), insufficient-data paths, savings-goal lifecycle |
| `tests/integration/recommendations.test.ts` | API `GET /api/personal/recommendations` mirrors pure-engine outputs with live DB state |

### 6.3 E2E (Playwright)

Extend existing `e2e/smoke.spec.ts` with: visit `/profile` (assert Current vs Target columns distinct), `/skills` (search + open detail), `/readiness` (dimension cards), `/financials` (add income → summary updates).

### 6.4 Migrated seed verification

`scripts/seed-personal-model.mjs` is idempotent; re-running does not duplicate skills/goals/state items (natural-key guards).

---

## 7. IMPLEMENTATION ORDER (Phase A–J)

| Phase | Work | Verifies |
|---|---|---|
| **A — Schema** | New enums + 10 tables, FKs, indexes | `prisma format` + `migrate dev` green |
| **B — Seed** | `seed-personal-model.mjs` (profile, state items, goals G1–G10, 78 skills, dependencies, goal-skill links, readiness dims, savings goal) + seedImpl integration | `pnpm db:seed-personal-model` idempotent; counts match spec |
| **C — Services + APIs** | 8 service modules + 15 routes, export/deletion extension | `tsc` + API integration suites |
| **D — Personal Model UI** | 5 pages (/profile, /skills×2, /readiness, /financials) + nav + AppShell divider | Visual smoke |
| **E — Today command brief** | Recommendation engine + Today slot | Pure unit tests + Today page renders brief |
| **F — Goal→Task→Skill mapping** | Task-skill endpoints + goal detail skill section | Integration tests |
| **G — Poland readiness** | `computeReadiness` + /readiness UI refinement | Readiness suite transitions |
| **H — Financial foundation** | Ledger + savings-goal UI + summary metrics | Financial suite |
| **I — Tests** | All suites above | `pnpm exec vitest run --project unit && --project integration` |
| **J — Integration verification** | `tsc && lint && build && smoke && playwright` | Full battery green |

---

## 8. RISK REGISTER

| Risk | Mitigation |
|---|---|
| Scope creep (78 skills) | Seeded bulk, not hand-crafted one-by-one in code; taxonomy is data |
| Skill “levels feel like game levels” | Rendered as muted capability labels, no XP/progress bar unless evidence-backed; emphasis on evidence timeline |
| Dependency cycle | Service validates on create; migration has no cycles in seed graph |
| Overwhelming Today | Brief caps at 3 items; empty/insufficient states are honest |
| Performance (skills list) | Single indexed query; <100 rows |
| Backward compat | All new tables nullable/optional relative to existing data; existing routes untouched |

---

## 9. ACCEPTANCE MAPPING

| AC | Satisfied by |
|---|---|
| AC-PM1 | `StateItem.kind` column + two-column UI |
| AC-PM2 | Goals G1–G6 active seeded, G7–G10 draft; profile/CGPA present |
| AC-PM3 | 78-row taxonomy + 8 categories + goal↔skill links |
| AC-PM4 | `SkillLevel` enum (no numeric score field) |
| AC-PM5 | `SkillEvidence` append-only, history query tested |
| AC-PM6 | `GoalSkillLink` + task-skill mapping + goal detail “Required skills” UI |
| AC-PM7 | Today command brief renders reason + goal + skills per recommendation |
| AC-PM8 | Every `Recommendation` has reason/evidence/confidence/action |
| AC-PM9 | Insufficient-data guard emits explicit insufficient cards |
| AC-PM10 | `TargetStateRequirement` + readiness dimensions (not habits) |
| AC-PM11 | `computeReadiness` missing/next-action per dimension |
| AC-PM12 | `SavingsGoal` targetAmount without requiring income rows |
| AC-PM13 | No existing table/field altered; all existing tests remain green |
| AC-PM14 | No XP/badges/streaks/confetti added; skill levels rendered neutrally |
| AC-PM15 | All new routes funnel through `requireSession` + userId scoping |
| AC-PM16 | New suites (unit + integration) |
| AC-PM17 | Existing suites re-run green |

---

## 10. WHAT IS EXPLICITLY OUT OF SCOPE (V1)

AI chatbot, autonomous decisions, ML, investment/medical advice, native mobile, social, gamification, calendar/email/wearable integrations — deferred, as specified.

