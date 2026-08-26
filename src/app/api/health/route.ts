import { prisma } from "@/server/db";
import { json } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return json({ ok: true, db, ts: new Date().toISOString() });
}
