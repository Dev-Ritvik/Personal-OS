"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useState } from "react";

const EPISTEMIC_LABEL: Record<string, string> = {
  FACT: "fact",
  SELF_REPORT: "self-report",
  INFERENCE: "inference",
  ASSESSMENT: "assessment",
};

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const skill = useQuery({
    queryKey: ["skill", params.id],
    queryFn: () => api<{ data: any }>(`/api/skills/${params.id}`).then((r) => r.data),
  });

  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [epistemic, setEpistemic] = useState("SELF_REPORT");

  const sk = skill.data as any;

  if (skill.isLoading) return <div className="panel rounded h-40 animate-pulse" />;
  if (!sk) return <p className="panel rounded p-4 text-sm">Not found.</p>;

  async function addEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!evidenceTitle.trim()) return;
    await api(`/api/skills/${params.id}/evidence`, {
      body: { title: evidenceTitle, epistemicClass: epistemic },
    });
    setEvidenceTitle("");
    await skill.refetch();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <span className="chip text-2xs">{sk.category?.replace("_", " ")}</span>
        <h1 className="text-lg font-semibold mt-1">{sk.name}</h1>
        {sk.description && <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{sk.description}</p>}
        <div className="flex items-center gap-2 mt-2">
          <span className="chip" style={{ color: "var(--faint)" }}>{sk.currentLevel} → {sk.targetLevel}</span>
          <span className={`chip ${sk.importance === 3 ? "chip-metric" : ""}`}>importance {sk.importance}</span>
          <span className="chip">{sk.status}</span>
        </div>
      </div>

      {/* Dependencies */}
      {(sk.dependencies?.length > 0 || sk.dependents?.length > 0) && (
        <section className="panel rounded p-4">
          <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Dependencies</h2>
          {sk.dependencies?.length > 0 && (
            <div className="mb-2">
              <span className="text-2xs" style={{ color: "var(--faint)" }}>Depends on:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {sk.dependencies.map((d: any) => (
                  <span key={d.id} className="chip text-2xs">{d.dependsOnSkill?.name ?? d.dependsOnSkillId}</span>
                ))}
              </div>
            </div>
          )}
          {sk.dependents?.length > 0 && (
            <div>
              <span className="text-2xs" style={{ color: "var(--faint)" }}>Required by:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {sk.dependents.map((d: any) => (
                  <span key={d.id} className="chip text-2xs" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>{d.skill?.name ?? d.skillId}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Linked goals */}
      {sk.goalLinks?.length > 0 && (
        <section className="panel rounded p-4">
          <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Supports goals</h2>
          <ul className="space-y-1">
            {sk.goalLinks.map((l: any) => (
              <li key={l.id} className="text-xs flex items-center gap-2">
                <span>{l.goal?.title ?? l.goalId}</span>
                <span className="num text-2xs" style={{ color: "var(--faint)" }}>{l.goal?.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence timeline — most important for AC-PM5 */}
      <section className="panel rounded p-4">
        <h2 className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>Evidence timeline</h2>
        <p className="text-2xs mb-3" style={{ color: "var(--faint)" }}>
          Every assessment preserves history. Levels require evidence — <span className="chip chip-insufficient text-2xs">UNKNOWN</span> means no evidence yet.
        </p>

        <form onSubmit={addEvidence} className="flex gap-2 mb-4">
          <input
            placeholder="Evidence title (e.g. Client proposal delivered)"
            value={evidenceTitle}
            onChange={(e) => setEvidenceTitle(e.target.value)}
            className="input flex-1 text-xs"
          />
          <select value={epistemic} onChange={(e) => setEpistemic(e.target.value)} className="input w-32 text-2xs">
            <option value="FACT">FACT</option>
            <option value="SELF_REPORT">SELF_REPORT</option>
            <option value="ASSESSMENT">ASSESSMENT</option>
            <option value="INFERENCE">INFERENCE</option>
          </select>
          <button className="btn btn-accent">Add</button>
        </form>

        {(sk.evidence ?? []).length === 0 ? (
          <p className="text-xs italic" style={{ color: "var(--faint)" }}>No evidence yet.</p>
        ) : (
          <ul className="space-y-2">
            {(sk.evidence ?? []).map((ev: any) => (
              <li key={ev.id} className="border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{ev.title}</span>
                  <span className={`chip text-2xs ${ev.epistemicClass === "FACT" ? "chip-metric" : ev.epistemicClass === "SELF_REPORT" ? "chip-insufficient" : ""}`}>
                    {EPISTEMIC_LABEL[ev.epistemicClass] ?? ev.epistemicClass}
                  </span>
                  {ev.assessedLevel && <span className="chip text-2xs">{ev.assessedLevel}</span>}
                </div>
                {ev.description && <p className="text-2xs mt-0.5" style={{ color: "var(--muted)" }}>{ev.description}</p>}
                <span className="num text-2xs" style={{ color: "var(--faint)" }}>{new Date(ev.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
