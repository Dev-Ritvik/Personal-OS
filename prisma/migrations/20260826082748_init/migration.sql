-- CreateEnum
CREATE TYPE "ValueClass" AS ENUM ('productive', 'maintenance', 'intentional_leisure', 'unproductive', 'neutral');

-- CreateEnum
CREATE TYPE "GoalHorizon" AS ENUM ('life', 'annual', 'quarterly');

-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('objective', 'project', 'milestone');

-- CreateEnum
CREATE TYPE "MeasureType" AS ENUM ('binary', 'quantity', 'duration', 'frequency', 'percentage', 'milestone', 'deadline', 'cumulative', 'rate');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('at_least', 'at_most');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('draft', 'active', 'paused', 'achieved', 'abandoned', 'archived');

-- CreateEnum
CREATE TYPE "BehaviorStatus" AS ENUM ('draft', 'active', 'paused', 'retired');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'doing', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "PlanRefType" AS ENUM ('behavior', 'task');

-- CreateEnum
CREATE TYPE "PlanOrigin" AS ENUM ('schedule', 'manual', 'ad_hoc');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('timer', 'quick_log', 'retro', 'import');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('interruption', 'distraction', 'idle', 'note');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('shown', 'dismissed', 'acted');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "webauthn_credentials" JSONB,
    "totp_secret_enc" TEXT,
    "totp_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "waking_start_min" INTEGER NOT NULL DEFAULT 420,
    "waking_end_min" INTEGER NOT NULL DEFAULT 1380,
    "prefs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value_class" "ValueClass" NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_history" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "horizon" "GoalHorizon" NOT NULL,
    "kind" "GoalKind" NOT NULL,
    "measure_type" "MeasureType" NOT NULL,
    "unit" TEXT,
    "target_value" DECIMAL(14,4),
    "current_value" DECIMAL(14,4),
    "direction" "Direction" NOT NULL DEFAULT 'at_least',
    "start_date" DATE,
    "target_date" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'draft',
    "closed_at" TIMESTAMP(3),
    "closing_value" DECIMAL(14,4),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "goal_id" TEXT,
    "category_id" TEXT,
    "title" TEXT NOT NULL,
    "schedule" JSONB NOT NULL,
    "target" JSONB NOT NULL,
    "status" "BehaviorStatus" NOT NULL DEFAULT 'active',
    "started_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_until" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "behaviors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "goal_id" TEXT,
    "behavior_id" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "estimate_min" INTEGER,
    "due_date" DATE,
    "priority" SMALLINT DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "deferred_count" INTEGER NOT NULL DEFAULT 0,
    "last_deferred_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_instances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "ref_type" "PlanRefType" NOT NULL,
    "ref_id" TEXT NOT NULL,
    "origin" "PlanOrigin" NOT NULL,
    "planned_minutes" INTEGER,
    "planned_qty" DECIMAL(12,3),
    "actual_minutes" INTEGER,
    "actual_qty" DECIMAL(12,3),
    "met" BOOLEAN,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),

    CONSTRAINT "plan_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "local_date" DATE NOT NULL,
    "duration_sec" INTEGER,
    "source" "EntrySource" NOT NULL,
    "task_id" TEXT,
    "behavior_id" TEXT,
    "category_id" TEXT,
    "note" TEXT,
    "device_id" TEXT,
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "amended_by" TEXT,
    "voided_at" TIMESTAMP(3),
    "client_op_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "taken_on" DATE NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "local_date" DATE NOT NULL,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "category_id" TEXT,
    "time_entry_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "energy" SMALLINT,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),

    CONSTRAINT "reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "metric_key" TEXT NOT NULL,
    "local_date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "payload" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("metric_key","local_date")
);

-- CreateTable
CREATE TABLE "intervention_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB NOT NULL,
    "disposition" "Disposition" NOT NULL,
    "meta" JSONB,

    CONSTRAINT "intervention_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "diff" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_ops" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_op_id" TEXT NOT NULL,
    "op" JSONB NOT NULL,
    "response" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_ops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE INDEX "category_history_category_id_idx" ON "category_history"("category_id");

-- CreateIndex
CREATE INDEX "goals_parent_id_idx" ON "goals"("parent_id");

-- CreateIndex
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");

-- CreateIndex
CREATE INDEX "behaviors_user_id_status_idx" ON "behaviors"("user_id", "status");

-- CreateIndex
CREATE INDEX "tasks_status_due_date_idx" ON "tasks"("status", "due_date");

-- CreateIndex
CREATE INDEX "plan_instances_local_date_idx" ON "plan_instances"("local_date");

-- CreateIndex
CREATE INDEX "plan_instances_user_id_local_date_idx" ON "plan_instances"("user_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_amended_by_key" ON "time_entries"("amended_by");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_client_op_id_key" ON "time_entries"("client_op_id");

-- CreateIndex
CREATE INDEX "time_entries_started_at_idx" ON "time_entries"("started_at");

-- CreateIndex
CREATE INDEX "time_entries_user_id_local_date_idx" ON "time_entries"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "time_entries_category_id_idx" ON "time_entries"("category_id");

-- CreateIndex
CREATE INDEX "measurements_user_id_key_taken_on_idx" ON "measurements"("user_id", "key", "taken_on");

-- CreateIndex
CREATE INDEX "events_user_id_local_date_idx" ON "events"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "reflections_user_id_local_date_idx" ON "reflections"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "intervention_log_user_id_rule_key_fired_at_idx" ON "intervention_log"("user_id", "rule_key", "fired_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_ops_client_op_id_key" ON "sync_ops"("client_op_id");

-- CreateIndex
CREATE INDEX "sync_ops_user_id_received_at_idx" ON "sync_ops"("user_id", "received_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_history" ADD CONSTRAINT "category_history_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviors" ADD CONSTRAINT "behaviors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviors" ADD CONSTRAINT "behaviors_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviors" ADD CONSTRAINT "behaviors_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_behavior_id_fkey" FOREIGN KEY ("behavior_id") REFERENCES "behaviors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_instances" ADD CONSTRAINT "plan_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_behavior_id_fkey" FOREIGN KEY ("behavior_id") REFERENCES "behaviors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_log" ADD CONSTRAINT "intervention_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
