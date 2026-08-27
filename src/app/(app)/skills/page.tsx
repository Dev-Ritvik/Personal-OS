"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

const CATEGORIES = ["TECHNICAL", "COMMUNICATION", "BUSINESS", "CAREER", "INDEPENDENT_LIVING", "PERSONAL_PERFORMANCE", "INTERNATIONAL"];

const LEVEL_COLOR: Record<string, string> = {
  UNKNOWN: "var(--faint)",
  BEGINNER: "#6b8cae",
  DEVELOPING: "#8a9a5b",
  FUNCTIONAL: "var(--accent)",
  STRONG: "var(--ok)",
  ADVANCED: "#b07d3b",
};

export default function SkillsPage() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["skills", category, search],
    queryFn: () =>
      api<{ data: any[] }>(
        `/api/skills?${new URLSearchParams({
          ...(category ? { category } : {}),
          ...(search ? { search } : {}),
        }).toString()}`,
      ).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Skills</h1>
        <span className="text-2xs chip">
          {(data ?? []).length} skills · levels are capability classifications, not game scores
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="Search skills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-48 text-xs"
        />
        <button className={`btn text-2xs ${!category ? "btn-accent" : ""}`} onClick={() => setCategory("")}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`btn text-2xs ${category === c ? "btn-accent" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="panel rounded h-40 animate-pulse" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((sk: any) => (
            <Link
              key={sk.id}
              href={`/skills/${sk.id}`}
              className="panel rounded p-3 hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-tight">{sk.name}</span>
                <span className="chip text-2xs" style={{ borderColor: LEVEL_COLOR[sk.currentLevel] ?? "var(--line)", color: LEVEL_COLOR[sk.currentLevel] ?? "var(--faint)" }}>
                  {sk.currentLevel}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-2xs" style={{ color: "var(--faint)" }}>
                <span>{sk.category.replace("_", " ")}</span>
                <span>·</span>
                <span>→ {sk.targetLevel}</span>
                {sk.importance === 3 && <span className="chip chip-metric ml-auto">priority 3</span>}
              </div>
              {sk.description && <p className="text-2xs mt-1.5 line-clamp-2" style={{ color: "var(--muted)" }}>{sk.description}</p>}
              {sk.currentLevel === "UNKNOWN" && (
                <p className="text-2xs mt-1.5 italic" style={{ color: "var(--faint)" }}>No evidence yet — level not assessed</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
