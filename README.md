# POS — Personal Operating System

A private, single-user behavioral operating system: goals → plans → logged reality → metrics → evidence-based signals. Truth over motivation; every displayed number states its formula and its data sufficiency.

Architecture is authoritative: see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind · Prisma · PostgreSQL (Supabase-ready) · TanStack Query · Zod · Vitest · Playwright

## Quick start (local dev)

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d     # Postgres on :5433
cp .env.example .env                               # then fill real values:
#   DATABASE_URL=postgresql://postgres:pos@localhost:5433/pos
#   APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
#   SETUP_TOKEN=$(node -e "console.log('setup-'+require('crypto').randomBytes(24).toString('hex'))")

pnpm db:migrate                                    # applies migrations
pnpm dev                                           # http://localhost:3000
```

First run: open **/bootstrap**, enter your `SETUP_TOKEN`, create the account, add the shown TOTP secret to your authenticator, confirm with a 6-digit code. Done — the instance has exactly one account forever.

Optional demo data: `pnpm db:seed` (requires bootstrapped account).

## Verification battery

| Command | What it proves |
|---|---|
| `pnpm test` | 55 metric-core unit tests: goldens, gates, missing≠zero, order invariance, DST/fold/gap |
| `pnpm typecheck` | strict TS across server+client |
| `pnpm lint` | ESLint clean |
| `pnpm build` | production compile |
| `bash scripts/reset-db.sh && node scripts/smoke.mjs` | 24 live API checks incl. auth+TOTP, idempotent replay (`x-idempotent-replay`), AC1/AC3/AC10/AC12/AC15 |
| `E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test` | full browser journey: bootstrap→Today→quick-log |

## Deploying to Vercel + Supabase (U1)

1. Supabase → new project → copy the **pooler** connection string → `DATABASE_URL`.
2. `DATABASE_URL=... pnpm db:deploy` (from your machine).
3. Vercel → import repo → set env: `DATABASE_URL`, `APP_SECRET`, `SETUP_TOKEN` (then delete after bootstrap), `CRON_SECRET`.
4. `vercel.json` already registers a nightly snapshot cron (04:30 UTC). `/api/jobs/snapshot` accepts `Authorization: Bearer $CRON_SECRET`.
5. Bootstrap the live instance once at `/bootstrap`, then remove `SETUP_TOKEN`.

### Backups

- Managed path: enable Supabase PITR / scheduled dumps.
- Independent path (recommended): nightly `pg_dump $DATABASE_URL | gzip > pos-$(date +%F).sql.gz` to storage you own. Restore = drop schema, restore dump, `prisma migrate deploy` no-op.
- User-level safety net regardless of host: Settings → *Export full JSON* (includes voided/amended history).

## Operational notes

- **Timezones**: every analytical row stores `local_date`, frozen at write time from the device tz. Changing profile tz affects only future entries; DST cannot rewrite history.
- **Corrections**: amending an entry voids the original and links a corrected sibling (`amended_by`). Nothing analytical is ever destroyed.
- **Offline**: mutating calls are queued in `localStorage` with `client_op_id`; the server dedupes replays idempotently. Pending/failed counts show in the sidebar.
- **Privacy**: zero third-party client calls — enforced by CSP (`connect-src 'self'`), system fonts only, no external error reporters.
- **Rate limits**: login 5/min/IP plus progressive lockout (5 fails → 15 min). In-memory per instance; fine for N=1.
- **Partial uniques** (live plan instances / measurements) live in migration `20260826083000_partial_unique` — raw SQL Prisma can't express.

## Schema amendments vs ARCHITECTURE.md §13

- `goals.current_value` added (manual progress updates for quantity/duration/deadline measures — target alone cannot express current without fabricating it). Versioned note inline in `schema.prisma`.
- `sessions` table materializes §15's revocable-session requirement.
- CSP allows `'unsafe-eval'` **only outside production** (React HMR); production headers stay strict.

## Repo hygiene

`setup-token.txt`, `dev.log`, `session.xml` are local runtime artifacts and git-ignored. Never commit `.env`.
