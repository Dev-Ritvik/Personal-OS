-- Partial unique indexes (ARCHITECTURE.md section 13): uniqueness among LIVE rows only.
-- Prisma schema language cannot express partial uniques; enforced here.

CREATE UNIQUE INDEX IF NOT EXISTS plan_instances_live_key
  ON plan_instances (user_id, local_date, ref_type, ref_id, origin)
  WHERE voided_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS measurements_live_key
  ON measurements (user_id, key, taken_on)
  WHERE voided_at IS NULL;
