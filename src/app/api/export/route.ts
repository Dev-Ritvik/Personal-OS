import { NextResponse } from "next/server";
import { audit, ApiError, handle, requireSession } from "@/server/api";
import { exportAll } from "@/server/services/exportService";

export const dynamic = "force-dynamic";

/** GET full-data JSON export (audited). */
export const GET = handle(async () => {
  const s = await requireSession();
  const payload = await exportAll(s.id);
  await audit(s.id, "export", "all");
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="pos-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});

void ApiError;
