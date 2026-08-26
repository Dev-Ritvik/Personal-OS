"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, deviceTimezone, flushQueue, failedCount, clearFailed, pendingCount, subscribeQueue, ApiHttpError, OfflineQueued, tzParam } from "./api";

/** Re-export for components that need them without double imports. */
export { api, ApiHttpError, OfflineQueued };

/* ---------- shared types (server payload mirrors) ----------------------- */

export interface MetricResultDto<T = number> {
  status: "ok" | "insufficient_data";
  value?: T;
  gates: Array<{ name: string; observed: number; required: number; passed: boolean }>;
  meta: {
    key: string;
    label: string;
    formula: string;
    epistemic: string;
    interpretation: string;
    limitation: string;
  };
}

export interface TodayPayload {
  today: string;
  timezone: string;
  focus: {
    behaviors: Array<{
      instanceId: string;
      behaviorId: string;
      label: string;
      met: boolean | null;
      doneAt: string | null;
      plannedQty: number | null;
      actualQty: number | null;
      actualMinutes: number | null;
      adHocExtra?: boolean;
    }>;
    tasksDueToday: TaskDto[];
    overdue: TaskDto[];
  };
  capture: {
    timerRunning: null | { entryId: string; startedAt: string; elapsedSec: number; label: string; note: string | null };
  };
  timeBudget: {
    wakingMinutes: number | null;
    plannedMinutes: number | null;
    executedPlannedMinutes: number | null;
    categorizedByClass: Record<string, number>;
    totalCategorizedMinutes: number;
  };
  metrics: {
    executionRateToday: MetricResultDto;
    consistency30d: MetricResultDto;
    variance14d: MetricResultDto<{ minutes: number; pct: number | null; plannedDays: number }>;
    overplanningRatio: MetricResultDto;
    underExecution14d: MetricResultDto;
    postponement: MetricResultDto<{ maxDepth: number; chronicCount: number; worstTaskIds: string[] }>;
    unknownTimeShareToday: MetricResultDto;
    degradedConfidence: boolean;
  };
  goalPace: Array<{
    goalId: string; title: string; unit: string;
    pace: number; requiredVelocityPerDay: number; observedVelocityPerDay: number; observationPoints: number;
  }>;
  flags: Array<{ key: string; severity: "info" | "warning"; message: string; evidence: Record<string, string | number | null> }>;
}

export interface TaskDto {
  id: string; title: string; status: string; priority: number;
  estimateMin: number | null; dueDate: string | null; deferredCount: number;
}

/* ---------- queue state hook -------------------------------------------- */

export function usePendingOps() {
  const [state, setState] = useState({ pending: 0, failed: 0 });
  useEffect(() => {
    const update = () => setState({ pending: pendingCount(), failed: failedCount() });
    update();
    return subscribeQueue(update);
  }, []);
  return {
    ...state,
    flushNow: () => flushQueue(),
    clearFailed,
  };
}

/* ---------- queries ------------------------------------------------------ */

export function useToday() {
  return useQuery({
    queryKey: ["today"],
    queryFn: () => api<{ data: TodayPayload }>(`/api/metrics/today?${tzParam()}`),
    select: (r) => r.data,
    refetchInterval: 60_000,
  });
}

export function useTasks(date?: string) {
  const q = date ? `?date=${date}` : "";
  return useQuery({
    queryKey: ["tasks", date ?? "auto"],
    queryFn: () =>
      api<{
        data: { overdue: TaskDto[]; today: TaskDto[]; inbox: TaskDto[]; done: TaskDto[] };
      }>(`/api/tasks${q}`),
    select: (r) => r.data,
  });
}

export function useCategories(archived = false) {
  return useQuery({
    queryKey: ["categories", archived],
    queryFn: () =>
      api<{
        data: Array<{ id: string; name: string; valueClass: string; sort: number; archivedAt?: string | null }>;
      }>(`/api/categories${archived ? "?archived=1" : ""}`),
    select: (r) => r.data,
  });
}

export function useBehaviors() {
  return useQuery({
    queryKey: ["behaviors"],
    queryFn: () =>
      api<{
        data: Array<{
          id: string; title: string; status: string;
          schedule: { type: string; days?: number[]; n?: number };
          target: { unit: string; aggregation: string; perDay?: number | null };
          categoryId: string | null;
        }>;
      }>("/api/behaviors"),
    select: (r) => r.data,
  });
}

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: () =>
      api<{
        data: Array<{
          id: string; parentId: string | null; title: string; horizon: string;
          kind: string; status: string; measureType: string; unit: string | null;
          targetValue: number | null; direction: string;
          startDate: string | null; targetDate: string | null;
        }>;
      }>("/api/goals"),
    select: (r) => r.data,
  });
}

export function useGoalDetail(id: string) {
  return useQuery({
    queryKey: ["goal", id],
    queryFn: () => api<{ data: Record<string, unknown> }>(`/api/goals/${id}`),
    select: (r) => r.data,
    enabled: !!id,
  });
}

export function useTimer() {
  return useQuery({
    queryKey: ["timer"],
    queryFn: () =>
      api<{
        data: null | {
          entryId: string; startedAt: string; elapsedSec: number;
          label?: string; note?: string | null;
        };
      }>(`/api/timer?${tzParam()}`),
    select: (r) => r.data,
    refetchInterval: 15_000,
  });
}

export function useEntries(date: string) {
  return useQuery({
    queryKey: ["entries", date],
    queryFn: () =>
      api<{
        data: Array<{
          id: string; startedAt: string; endedAt: string | null; localDate: string;
          durationSec: number | null; source: string; voidedAt: string | null;
          amendedBy: string | null; autoClosed: boolean; note: string | null;
          category?: { name: string; valueClass: string } | null;
          task?: { title: string } | null;
          behavior?: { title: string } | null;
        }>;
      }>(`/api/time-entries?date=${date}&${tzParam()}`),
    select: (r) => r.data,
  });
}

export function useAnalytics(days: number) {
  return useQuery({
    queryKey: ["analytics", days],
    queryFn: () => api<{ data: AnalyticsPayload }>(`/api/analytics?days=${days}`),
    select: (r) => r.data,
  });
}

interface AnalyticsPayload {
  range: { from: string; to: string };
  metrics: Record<string, MetricResultDto<never> | unknown>;
  weeklyOverdue: Array<{ weekStart: string; count: number }>;
  series: Array<{
    date: string;
    plannedMinutes: number | null;
    executedPlannedMinutes: number | null;
    productiveMinutes: number;
    maintenanceMinutes: number;
    leisureMinutes: number;
    unknownShare: number | null;
    executionRate: number | null;
    tasksDue: number;
    behaviorScheduled: number | null;
  }>;
}

/* ---------- mutations ----------------------------------------------------- */

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
}

export function useTimerActions() {
  const invalidate = useInvalidate();
  const start = useMutation({
    mutationFn: (input: { categoryId?: string | null; taskId?: string | null; behaviorId?: string | null; note?: string | null }) =>
      api(`/api/timer`, { body: { action: "start", ...input, deviceTz: deviceTimezone() } }),
    onSuccess: () => invalidate("timer", "today", "entries"),
  });
  const stop = useMutation({
    mutationFn: () => api(`/api/timer`, { body: { action: "stop" } }),
    onSuccess: () => invalidate("timer", "today", "entries"),
  });
  return { start, stop };
}

export function useQuickLog() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      durationMin: number; categoryId?: string | null; taskId?: string | null;
      behaviorId?: string | null; note?: string | null;
    }) => api(`/api/time-entries`, { body: { ...input, deviceTz: deviceTimezone() } }),
    onSuccess: () => invalidate("today", "entries"),
  });
}

export function useCheckin() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { instanceId: string; actualQty?: number | null; actualMinutes?: number | null }) =>
      api(`/api/plan-instances/${v.instanceId}/checkin`, {
        body: { actualQty: v.actualQty ?? null, actualMinutes: v.actualMinutes ?? null },
      }),
    onSuccess: () => invalidate("today"),
  });
}

export function useTaskMutations() {
  const invalidate = useInvalidate();
  const create = useMutation({
    mutationFn: (input: { title: string; dueDate?: string | null; estimateMin?: number | null; priority?: number; goalId?: string | null }) =>
      api(`/api/tasks`, { body: input }),
    onSuccess: () => invalidate("tasks", "today"),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api(`/api/tasks/${v.id}`, { method: "PATCH", body: { status: v.status } }),
    onSuccess: () => invalidate("tasks", "today"),
  });
  const defer = useMutation({
    mutationFn: (v: { id: string; newDueDate: string; reason?: string }) =>
      api(`/api/tasks/${v.id}`, { body: { newDueDate: v.newDueDate, reason: v.reason } }),
    onSuccess: () => invalidate("tasks", "today"),
  });
  return { create, setStatus, defer };
}

export function useBehaviorCreate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: unknown) => api(`/api/behaviors`, { body }),
    onSuccess: () => invalidate("behaviors", "today"),
  });
}

export function useCategoryCreate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; valueClass: string }) => api(`/api/categories`, { body }),
    onSuccess: () => invalidate("categories"),
  });
}

export function useSettingsPatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { timezone?: string; wakingStartMin?: number; wakingEndMin?: number }) =>
      api(`/api/me`, { method: "PATCH", body }),
    onSuccess: () => invalidate("me"),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{
        data: {
          user: { email: string; timezone: string; wakingStartMin: number; wakingEndMin: number; totpConfirmed: boolean };
          sessions: Array<{ id: string; userAgent: string | null; lastSeenAt: string; createdAt: string }>;
          currentSessionId: string;
        };
      }>(`/api/me`),
    select: (r) => r.data,
  });
}

export function useSnapshotJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (range?: { from: string; to: string }) =>
      api<{ ok: boolean; daysWritten: number; goalSeriesWritten: number; range: { from: string; to: string } }>(
        "/api/jobs/snapshot",
        { body: range ?? {} },
      ),
    onSuccess: () => void qc.invalidateQueries(),
  });
}
