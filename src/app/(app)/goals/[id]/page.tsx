"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useGoalDetail } from "@/lib/client/hooks";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

interface Detail {
  id: string; title: string; description: string | null;
  horizon: string; kind: string; measureType: string;
  unit: string | null; targetValue: number | null; direction: string;
  startDate: string | null; targetDate: string | null; status: string;
  progress: { value01: number | null; currentLabel: string; basis: string; timeElapsed01?: number | null };
  rollupFromChildren: number | null;
  children: Array<{ id: string; title: string; status: string }>;
  tasks: Array<{ id: string; title: string; status: string; dueDate: string | null }>;
  behaviorIds: Array<{ id: string; title: string }>;
}

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useGoalDetail(params.id);

  if (isLoading) return <div className="panel rounded h-40 animate-pulse" />;
  const g = data as unknown as Detail | undefined;
  if (!g) return <p className="panel rounded p-4 text-sm">Not found.</p>;

  async function setStatus(status: string) {
    await fetch(`/api/goals/${g!.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  const p01 = g.progress.value01 ?? g.rollupFromChildren;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/goals" className="text-2xs" style={{ color: "var(--faint)" }}>
          ← Goals
        </Link>
        <div className="flex items-start justify-between gap-3 mt-1">
          <h1 className="text-lg font-semibold">{g.title}</h1>
          <span className={`chip ${["achieved", "abandoned", "archived"].includes(g.status) ? "chip-insufficient" : "chip-metric"}`}>
            {g.status}
          </span>
        </div>
      </div>

      {/* Progress — honest basis label; P1 measures render honestly (AC7) */}
      <section className="panel rounded p-4 space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span style={{ color: "var(--muted)" }}>
            {g.measureType} · {g.direction}
            {g.targetValue !== null && ` · target ${g.targetValue}${g.unit ? ` ${g.unit}` : ""}`}
          </span>
          <span className="num">{p01 === null ? "—" : `${Math.round(p01 * 100)}%`}</span>
        </div>
        {p01 === null ? (
          <p className="text-2xs" style={{ color: "var(--faint)" }}>
            This measure type is computed in P1 (rolling-window compliance). No fabricated fraction.
          </p>
        ) : (
          <div className="h-2 rounded overflow-hidden" style={{ background: "var(--panel-2)" }}>
            <div className="h-full" style={{ width: `${Math.min(100, p01 * 100)}%`, background: "var(--accent)", opacity: 0.8 }} />
          </div>
        )}
        <p className="text-2xs num" style={{ color: "var(--faint)" }}>
          basis: {g.progress.basis}
          {g.progress.timeElapsed01 != null && ` · calendar elapsed ${Math.round(g.progress.timeElapsed01 * 100)}%`}
          {g.rollupFromChildren !== null && p01 !== g.rollupFromChildren && ` · roll-up from ${g.children.length} children`}
        </p>
      </section>

      {g.status === "active" && (
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void setStatus("paused")}>Pause</button>
          <button className="btn" onClick={() => void setStatus("achieved")}>Mark achieved</button>
          <button className="btn" onClick={() => void setStatus("abandoned")}>Abandon</button>
          <span className="text-2xs self-center" style={{ color: "var(--faint)" }}>
            Abandonment is a legitimate modeled outcome — it stays in your base rates.
          </span>
        </div>
      )}

      {(g.children.length > 0 || g.tasks.length > 0) && (
        <section className="panel rounded p-4 grid sm:grid-cols-2 gap-4">
          {g.children.length > 0 && (
            <div>
              <h2 className="text-2xs uppercase tracking-wider mb-1.5" style={{ color: "var(--faint)" }}>Children</h2>
              <ul className="space-y-1">
                {g.children.map((c: any) => (
                  <li key={c.id}>
                    <Link href={`/goals/${c.id}`} className="text-xs hover:underline">{c.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {g.tasks.length > 0 && (
            <div>
              <h2 className="text-2xs uppercase tracking-wider mb-1.5" style={{ color: "var(--faint)" }}>Tasks</h2>
              <ul className="space-y-1 num text-xs" style={{ color: "var(--muted)" }}>
                {g.tasks.map((t) => (
                  <li key={t.id}>
                    [{t.status}] {t.title}
                    {t.dueDate ? ` → ${t.dueDate}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <GoalSkills goalId={g.id} />
    </div>
  );
}

function GoalSkills({ goalId }: { goalId: string }) {
  const { data } = useQuery({
    queryKey: ["goal-skills", goalId],
    queryFn: () => api<{ data: any[] }>(`/api/goals/${goalId}/skills`).then((r) => r.data),
  });
  const skills = (data ?? []) as any[];
  return (
    <section className="panel rounded p-4">
      <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>
        Required Skills — Goal → Skill graph (AC-PM6)
      </h2>
      {skills.length === 0 ? (
        <p className="text-2xs" style={{ color: "var(--faint)" }}>No skills linked yet. Skills make the capability chain visible without inventing scores.</p>
      ) : (
        <ul className="space-y-1.5">
          {skills.map((link: any) => (
            <li key={link.id} className="flex items-center gap-2 text-xs">
              <Link href={`/skills/${link.skill.id}`} className="hover:underline font-medium">{link.skill.name}</Link>
              <span className="chip text-2xs" style={{ color: "var(--faint)" }}>{link.skill.category?.replace("_", " ")}</span>
              <span className="chip text-2xs">{link.skill.currentLevel} → {link.requiredLevel ?? link.skill.targetLevel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
