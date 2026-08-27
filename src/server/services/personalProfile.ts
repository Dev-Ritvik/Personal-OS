import { prisma } from "../db";
import { uuidv7 } from "../ids";

export async function getProfile(userId: string) {
  let profile = await prisma.personalProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.personalProfile.create({
      data: { id: uuidv7(), userId },
    });
  }
  return profile;
}

export async function updateProfile(
  userId: string,
  input: {
    displayName?: string | null;
    location?: string | null;
    education?: string | null;
    academicYear?: string | null;
    currentCgpa?: number | null;
    targetCgpa?: number | null;
    classSchedule?: unknown;
    bestWorkWindow?: string | null;
    worstWorkWindow?: string | null;
    sleepWindow?: unknown;
    sleepInconsistency?: number | null;
    preferences?: unknown;
    constraints?: unknown;
  },
) {
  await getProfile(userId);
  return prisma.personalProfile.update({
    where: { userId },
    data: {
      displayName: input.displayName,
      location: input.location,
      education: input.education,
      academicYear: input.academicYear,
      currentCgpa: input.currentCgpa,
      targetCgpa: input.targetCgpa,
      classSchedule: input.classSchedule as object | undefined,
      bestWorkWindow: input.bestWorkWindow,
      worstWorkWindow: input.worstWorkWindow,
      sleepWindow: input.sleepWindow as object | undefined,
      sleepInconsistency: input.sleepInconsistency,
      preferences: input.preferences as object | undefined,
      constraints: input.constraints as object | undefined,
    },
  });
}
