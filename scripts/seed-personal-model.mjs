/**
 * Seed Personal Model V1 — idempotent by natural keys.
 * Seeds the user's known personal facts from Phase 6 spec §31.
 * Run: node scripts/seed-personal-model.mjs
 * Requires: bootstrapped account (personal_profiles FK)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function id() {
  return crypto.randomUUID().replace(/^.{12}/, () => Date.now().toString(16).padStart(12, "0"));
}

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No user found. Complete /bootstrap first.");
    process.exit(1);
  }
  console.log("Seeding Personal Model V1 for", user.email);

  // ── PersonalProfile ──────────────────────────────────────────────────
  await prisma.personalProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      id: id(),
      userId: user.id,
      displayName: "Dev Ritvik",
      location: "LPU hostel, Jalandhar, Punjab, India",
      education: "B.Tech CSE — AI & ML",
      academicYear: "2nd year, 1st semester",
      currentCgpa: 7.5,
      targetCgpa: 8.0,
      classSchedule: { Mon: "11:00-17:00", Tue: "11:00-17:00", Wed: "11:00-17:00", Thu: "09:00-17:00", Fri: "11:00-17:00" },
      bestWorkWindow: "early_morning",
      worstWorkWindow: "unpredictable",
      sleepWindow: { bed: "22:00", wake: "07:00" },
      sleepInconsistency: 8,
      preferences: {
        trackingImportance: { study: 3, coding: 1, business: 3, fitness: 2, sleep: 1, food: 2, money: 3, social: 2, family: 2, mood: 1, reading: 3, gaming: 2, entertainment: 2, personalProjects: 3, discipline: 3 },
      },
      constraints: [],
    },
  });
  console.log("  profile ✓");

  // ── StateItems ───────────────────────────────────────────────────────
  const currentItems = [
    { domain: "academic", label: "CGPA", value: "≈ 7.5" },
    { domain: "academic", label: "Institution", value: "LPU — 2nd year CSE AI&ML" },
    { domain: "routine", label: "Productivity peak", value: "Early morning" },
    { domain: "routine", label: "Consistency", value: "Inconsistent routines — 8/10" },
    { domain: "behavioral", label: "Distraction", value: "Instagram / doomscrolling" },
    { domain: "project", label: "Active project", value: "QHR-Ecosystem (CRM + 3D/WebGL)" },
    { domain: "lifestyle", label: "Living", value: "Hostel — meals not self-managed" },
  ];
  const targetItems = [
    { domain: "academic", label: "CGPA", value: "≥ 8.0" },
    { domain: "routine", label: "Morning", value: "07:00 wake → gym → cook → groom → classes" },
    { domain: "capability", label: "Gym", value: "Consistent 3×/week" },
    { domain: "capability", label: "Cooking", value: "Independent — all meals" },
    { domain: "academic", label: "Institution", value: "WUST student" },
    { domain: "career", label: "Work", value: "High-paying remote job" },
    { domain: "lifestyle", label: "Living", value: "Independent — rent/food/chores" },
    { domain: "habit", label: "Reading", value: "10 pages/night" },
    { domain: "financial", label: "Discipline", value: "Cover living + save + invest" },
    { domain: "academic", label: "Mobility", value: "Poland — Sep 2027" },
  ];
  for (const [idx, item] of currentItems.entries()) {
    const exists = await prisma.stateItem.findFirst({ where: { userId: user.id, kind: "CURRENT", label: item.label } });
    if (!exists) await prisma.stateItem.create({ data: { id: id(), userId: user.id, kind: "CURRENT", domain: item.domain, label: item.label, value: item.value, sort: idx } });
  }
  for (const [idx, item] of targetItems.entries()) {
    const exists = await prisma.stateItem.findFirst({ where: { userId: user.id, kind: "TARGET", label: item.label } });
    if (!exists) await prisma.stateItem.create({ data: { id: id(), userId: user.id, kind: "TARGET", domain: item.domain, label: item.label, value: item.value, sort: idx } });
  }
  console.log("  state items ✓");

  // ── Goals G1–G10 (re-use existing Goal table) ────────────────────────
  const life = await prisma.goal.findFirst({ where: { userId: user.id, horizon: "life", deletedAt: null } });
  let lifeId = life?.id;
  if (!lifeId) {
    const g = await prisma.goal.create({ data: { id: id(), userId: user.id, title: "Life direction: build systems for Poland trajectory", horizon: "life", kind: "objective", measureType: "binary", status: "active" } });
    lifeId = g.id;
  }
  const goalDefs = [
    { title: "G1 — QHR-Ecosystem delivery", horizon: "quarterly", kind: "project", measureType: "deadline", targetDate: new Date("2026-11-01"), status: "active", desc: "CRM + 3D/WebGL for Quality Homes Reality — end-to-end tested delivery" },
    { title: "G2 — Q1 Scopus paper (AI systems & foundations)", horizon: "annual", kind: "project", measureType: "binary", status: "active" },
    { title: "G3 — WUST 2+2 / transfer eligibility", horizon: "annual", kind: "objective", measureType: "binary", targetDate: new Date("2027-09-01"), status: "active" },
    { title: "G4 — Remote-job prerequisites", horizon: "annual", kind: "objective", measureType: "binary", status: "active" },
    { title: "G5 — Earn ₹5,00,000 before Poland", horizon: "annual", kind: "objective", measureType: "quantity", targetValue: 500000, unit: "INR", status: "active" },
    { title: "G6 — CGPA ≥ 8.0", horizon: "annual", kind: "objective", measureType: "quantity", targetValue: 8.0, unit: "CGPA", status: "active" },
    { title: "G7 — KTH exchange capability", horizon: "annual", kind: "objective", measureType: "binary", status: "draft" },
    { title: "G8 — Poland living: earn/cover/save/invest", horizon: "annual", kind: "objective", measureType: "binary", status: "draft" },
    { title: "G9 — Master's NL/DE/CH", horizon: "life", kind: "objective", measureType: "binary", status: "draft" },
    { title: "G10 — Settle NO/NL", horizon: "life", kind: "objective", measureType: "binary", status: "draft" },
  ];
  for (const g of goalDefs) {
    const exists = await prisma.goal.findFirst({ where: { userId: user.id, title: g.title, deletedAt: null } });
    if (!exists) {
      await prisma.goal.create({
        data: {
          id: id(),
          userId: user.id,
          parentId: g.horizon === "life" ? null : lifeId,
          title: g.title,
          description: g.desc ?? null,
          horizon: g.horizon,
          kind: g.kind,
          measureType: g.measureType,
          targetValue: g.targetValue ?? null,
          unit: g.unit ?? null,
          targetDate: g.targetDate ?? null,
          status: g.status,
        },
      });
    }
  }
  console.log("  goals G1–G10 ✓");

  // ── Skills — 78 rows §9 ─────────────────────────────────────────────
  const taxonomy = {
    TECHNICAL: ["Python","AI/ML fundamentals","Machine learning systems","Deep learning","Statistics","Probability","Software engineering","System design","Databases","APIs","Cloud","Linux","Git/GitHub","Testing","Debugging","Technical research","Scientific methodology","Technical reading","Scientific writing"],
    COMMUNICATION: ["Spoken English","Professional communication","Technical communication","Presentation","Public speaking","Storytelling","Writing","Active listening","Explaining complex concepts simply","Interpersonal communication"],
    BUSINESS: ["Sales","Discovery","Needs analysis","Proposal writing","Pricing","Negotiation","Client communication","Client management","Lead generation","Lead qualification","Closing","Client retention","Business operations"],
    CAREER: ["Resume/CV","Portfolio","Interviewing","Technical interviewing","Networking","LinkedIn","Personal branding","Job searching","Remote work","Freelancing","Project management"],
    INDEPENDENT_LIVING: ["Cooking","Meal planning","Grocery management","Nutrition basics","Budgeting","Personal finance","Saving","Investing fundamentals","Household management","Cleaning","Laundry","Travel planning","Basic bureaucracy","Rental/apartment management"],
    PERSONAL_PERFORMANCE: ["Planning","Prioritization","Time estimation","Focus","Procrastination control","Routine adherence","Digital distraction control","Sleep consistency","Exercise consistency","Recovery","Self-review"],
    INTERNATIONAL: ["Cultural adaptability","Intercultural communication","Independent travel","International professional networking","Living abroad","Local-language learning","Bureaucracy navigation","Professional etiquette across cultures"],
  };
  const strongSet = new Set(["Technical research","Scientific writing","Presentation","Proposal writing","Negotiation","Portfolio","Technical interviewing","Networking"]);
  let skillSort = 0;
  for (const [category, names] of Object.entries(taxonomy)) {
    for (const name of names) {
      const exists = await prisma.skill.findFirst({ where: { userId: user.id, name } });
      if (!exists) {
        await prisma.skill.create({
          data: {
            id: id(),
            userId: user.id,
            name,
            category: category as never,
            currentLevel: "UNKNOWN",
            targetLevel: strongSet.has(name) ? "STRONG" : "FUNCTIONAL",
            importance: ["Planning","Routine adherence","Digital distraction control","Sales","Client communication","Technical research","Scientific writing"].includes(name) ? 3 : 2,
            sort: skillSort++,
          },
        });
      }
    }
  }
  console.log("  skills ✓");

  // ── Skill dependencies — 18 edges §10 ────────────────────────────────
  const skillByName = Object.fromEntries((await prisma.skill.findMany({ where: { userId: user.id }, select: { id: true, name: true } })).map((s) => [s.name, s.id]));
  const depPairs = [
    ["Professional communication","Spoken English"],
    ["Technical communication","Professional communication"],
    ["Presentation","Technical communication"],
    ["Scientific methodology","Technical research"],
    ["Technical research","Scientific methodology"],
    ["Scientific writing","Technical research"],
    ["Discovery","Sales"],
    ["Needs analysis","Discovery"],
    ["Proposal writing","Needs analysis"],
    ["Negotiation","Proposal writing"],
    ["Client communication","Negotiation"],
    ["Meal planning","Cooking"],
    ["Grocery management","Meal planning"],
    ["Budgeting","Grocery management"],
    ["Household management","Budgeting"],
    ["Portfolio","Resume/CV"],
    ["Technical interviewing","Portfolio"],
    ["Networking","Technical interviewing"],
  ];
  for (const [a,b] of depPairs) {
    const skillId = skillByName[a], dependsOn = skillByName[b];
    if (!skillId || !dependsOn) continue;
    const exists = await prisma.skillDependency.findFirst({ where: { skillId, dependsOnSkillId: dependsOn } });
    if (!exists) await prisma.skillDependency.create({ data: { id: id(), userId: user.id, skillId, dependsOnSkillId: dependsOn } });
  }
  console.log("  skill dependencies ✓");

  // ── Goal↔Skill links ─────────────────────────────────────────────────
  const goalByTitle = Object.fromEntries((await prisma.goal.findMany({ where: { userId: user.id, deletedAt: null }, select: { id: true, title: true } })).map((g) => [g.title, g.id]));
  const linkDefs = [
    ["G1 — QHR-Ecosystem delivery", ["Software engineering","System design","Databases","APIs","Testing","Debugging","Client communication","Project management"]],
    ["G2 — Q1 Scopus paper (AI systems & foundations)", ["Technical research","Scientific methodology","Scientific writing","Technical reading","Statistics","Presentation"]],
    ["G5 — Earn ₹5,00,000 before Poland", ["Sales","Proposal writing","Negotiation","Lead generation","Client retention","Pricing"]],
    ["G3 — WUST 2+2 / transfer eligibility", ["Spoken English","Technical communication","Presentation","Resume/CV","Portfolio","Networking"]],
    ["G6 — CGPA ≥ 8.0", ["Planning","Time estimation","Focus","Routine adherence","Technical reading"]],
  ];
  for (const [goalTitle, skillNames] of linkDefs) {
    const goalId = goalByTitle[goalTitle];
    if (!goalId) continue;
    for (const sName of skillNames) {
      const skillId = skillByName[sName];
      if (!skillId) continue;
      const exists = await prisma.goalSkillLink.findFirst({ where: { goalId, skillId } });
      if (!exists) await prisma.goalSkillLink.create({ data: { id: id(), userId: user.id, goalId, skillId } });
    }
  }
  console.log("  goal-skill links ✓");

  // ── Readiness dimensions (8) ─────────────────────────────────────────
  const readinessDims = [
    { key: "academic", label: "Academic", description: "CGPA, research, WUST eligibility" },
    { key: "technical", label: "Technical", description: "Engineering depth for remote work & research" },
    { key: "career", label: "Career", description: "Portfolio, interviews, remote-work readiness" },
    { key: "financial", label: "Financial", description: "Earnings, budgeting, savings trajectory" },
    { key: "independent_living", label: "Independent living", description: "Cooking, household, budgeting" },
    { key: "communication", label: "Communication", description: "Professional & technical communication" },
    { key: "international", label: "International", description: "Cultural adaptability, bureaucracy, travel" },
    { key: "physical_routine", label: "Physical routine", description: "Gym, sleep, recovery, routine adherence" },
  ];
  for (const [idx, dim] of readinessDims.entries()) {
    const exists = await prisma.readinessDimension.findFirst({ where: { userId: user.id, key: dim.key } });
    if (!exists) await prisma.readinessDimension.create({ data: { id: id(), userId: user.id, key: dim.key, label: dim.label, description: dim.description, sort: idx } });
  }
  console.log("  readiness dimensions ✓");

  // ── SavingsGoal ₹5L ──────────────────────────────────────────────────
  let account = await prisma.financialAccount.findUnique({ where: { userId: user.id } });
  if (!account) account = await prisma.financialAccount.create({ data: { id: id(), userId: user.id, currency: "INR" } });
  const sgExists = await prisma.savingsGoal.findFirst({ where: { userId: user.id, title: { contains: "₹5L" } } });
  if (!sgExists) {
    await prisma.savingsGoal.create({
      data: { id: id(), userId: user.id, accountId: account.id, title: "Pre-Poland earnings — ₹5L", targetAmount: 500000, targetDate: new Date("2027-09-01"), status: "active" },
    });
  }
  console.log("  savings goal ₹5L ✓");

  console.log("Personal Model V1 seed complete (idempotent).");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
