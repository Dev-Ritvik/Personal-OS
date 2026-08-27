-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('UNKNOWN', 'BEGINNER', 'DEVELOPING', 'FUNCTIONAL', 'STRONG', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('TECHNICAL', 'COMMUNICATION', 'BUSINESS', 'CAREER', 'INDEPENDENT_LIVING', 'PERSONAL_PERFORMANCE', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvidenceClass" AS ENUM ('FACT', 'SELF_REPORT', 'INFERENCE', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "StateKind" AS ENUM ('CURRENT', 'TARGET');

-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "personal_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "location" TEXT,
    "education" TEXT,
    "academic_year" TEXT,
    "current_cgpa" DECIMAL(4,2),
    "target_cgpa" DECIMAL(4,2),
    "class_schedule" JSONB,
    "best_work_window" TEXT,
    "worst_work_window" TEXT,
    "sleep_window" JSONB,
    "sleep_inconsistency" INTEGER,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "personal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "StateKind" NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "state_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "description" TEXT,
    "current_level" "SkillLevel" NOT NULL DEFAULT 'UNKNOWN',
    "target_level" "SkillLevel" NOT NULL DEFAULT 'FUNCTIONAL',
    "importance" INTEGER NOT NULL DEFAULT 2,
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_assessed_at" TIMESTAMPTZ(6),
    "next_review_at" TIMESTAMPTZ(6),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_dependencies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "depends_on_skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_evidence" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "epistemic_class" "EvidenceClass" NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "assessed_level" "SkillLevel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_skill_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "required_level" "SkillLevel",
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_skill_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_skill_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_skill_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_state_requirements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "required_skills" TEXT[] NOT NULL,
    "required_goals" TEXT[] NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_state_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" "FinancialEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "linked_goal_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target_amount" DECIMAL(12,2) NOT NULL,
    "target_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_dimensions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_requirements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dimension_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "skill_id" TEXT,
    "goal_id" TEXT,
    "evidence_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_profiles_user_id_key" ON "personal_profiles"("user_id");

-- CreateIndex
CREATE INDEX "state_items_user_id_kind_idx" ON "state_items"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "skills_user_id_name_key" ON "skills"("user_id", "name");

-- CreateIndex
CREATE INDEX "skills_user_id_category_idx" ON "skills"("user_id", "category");

-- CreateIndex
CREATE INDEX "skills_user_id_status_idx" ON "skills"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "skill_dependencies_skill_id_depends_on_skill_id_key" ON "skill_dependencies"("skill_id", "depends_on_skill_id");

-- CreateIndex
CREATE INDEX "skill_dependencies_depends_on_skill_id_idx" ON "skill_dependencies"("depends_on_skill_id");

-- CreateIndex
CREATE INDEX "skill_evidence_skill_id_idx" ON "skill_evidence"("skill_id");

-- CreateIndex
CREATE INDEX "skill_evidence_user_id_skill_id_idx" ON "skill_evidence"("user_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "goal_skill_links_goal_id_skill_id_key" ON "goal_skill_links"("goal_id", "skill_id");

-- CreateIndex
CREATE INDEX "goal_skill_links_skill_id_idx" ON "goal_skill_links"("skill_id");

-- CreateIndex
CREATE INDEX "goal_skill_links_goal_id_idx" ON "goal_skill_links"("goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_skill_links_task_id_skill_id_key" ON "task_skill_links"("task_id", "skill_id");

-- CreateIndex
CREATE INDEX "task_skill_links_skill_id_idx" ON "task_skill_links"("skill_id");

-- CreateIndex
CREATE INDEX "task_skill_links_task_id_idx" ON "task_skill_links"("task_id");

-- CreateIndex
CREATE INDEX "target_state_requirements_user_id_dimension_idx" ON "target_state_requirements"("user_id", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_user_id_key" ON "financial_accounts"("user_id");

-- CreateIndex
CREATE INDEX "financial_entries_user_id_kind_occurred_on_idx" ON "financial_entries"("user_id", "kind", "occurred_on");

-- CreateIndex
CREATE INDEX "financial_entries_account_id_idx" ON "financial_entries"("account_id");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_status_idx" ON "savings_goals"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_dimensions_user_id_key_key" ON "readiness_dimensions"("user_id", "key");

-- CreateIndex
CREATE INDEX "readiness_requirements_dimension_id_idx" ON "readiness_requirements"("dimension_id");

-- AddForeignKey
ALTER TABLE "personal_profiles" ADD CONSTRAINT "personal_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_items" ADD CONSTRAINT "state_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_dependencies" ADD CONSTRAINT "skill_dependencies_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_dependencies" ADD CONSTRAINT "skill_dependencies_depends_on_skill_id_fkey" FOREIGN KEY ("depends_on_skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_skill_links" ADD CONSTRAINT "goal_skill_links_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_skill_links" ADD CONSTRAINT "goal_skill_links_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_skill_links" ADD CONSTRAINT "goal_skill_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_skill_links" ADD CONSTRAINT "task_skill_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_skill_links" ADD CONSTRAINT "task_skill_links_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_skill_links" ADD CONSTRAINT "task_skill_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_state_requirements" ADD CONSTRAINT "target_state_requirements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_linked_goal_id_fkey" FOREIGN KEY ("linked_goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_dimensions" ADD CONSTRAINT "readiness_dimensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_requirements" ADD CONSTRAINT "readiness_requirements_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "readiness_dimensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_requirements" ADD CONSTRAINT "readiness_requirements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
