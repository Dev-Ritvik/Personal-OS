import { handle, json } from "@/server/api";
import {
  authorizeSnapshotRequest,
  executeSnapshotJob,
  readJobBody,
} from "@/server/jobs/snapshotRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Snapshot job endpoint.
 *  - GET  → Vercel Cron (Authorization: Bearer $CRON_SECRET) — vercel.json
 *  - POST → manual recompute (session OR bearer), Settings button / scripts
 * Both call the SAME shared executor (Phase-5 remediation).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await authorizeSnapshotRequest(req);
    return json(await executeSnapshotJob(actor, await readJobBody(req)));
  })();
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await authorizeSnapshotRequest(req);
    return json(await executeSnapshotJob(actor, await readJobBody(req)));
  })();
}
