import { handle, json, requireSession } from "@/server/api";
import { getProfile, updateProfile } from "@/server/services/personalProfile";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await getProfile(s.id) });
});

const patchSchema = z.object({
  displayName: z.string().max(100).nullish(),
  location: z.string().max(200).nullish(),
  education: z.string().max(200).nullish(),
  academicYear: z.string().max(100).nullish(),
  currentCgpa: z.number().min(0).max(10).nullish(),
  targetCgpa: z.number().min(0).max(10).nullish(),
  classSchedule: z.unknown().nullish(),
  bestWorkWindow: z.string().max(100).nullish(),
  worstWorkWindow: z.string().max(100).nullish(),
  sleepWindow: z.unknown().nullish(),
  sleepInconsistency: z.number().int().min(0).max(10).nullish(),
  preferences: z.unknown().nullish(),
  constraints: z.unknown().nullish(),
});

export const PATCH = handle(async (req: Request) => {
  const s = await requireSession();
  const body = patchSchema.parse(await req.json());
  return json({ data: await updateProfile(s.id, body) });
});
