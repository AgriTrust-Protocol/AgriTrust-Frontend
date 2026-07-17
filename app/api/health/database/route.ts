import { NextResponse } from "next/server";
import { getDatabasePool } from "@/src/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Kubernetes readiness probe. Deliberately returns no credentials or database errors. */
export async function GET(): Promise<NextResponse> {
  const pool = getDatabasePool();
  if (!pool) {
    return NextResponse.json({ status: "not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const health = await pool.probe();
  const status = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status, headers: { "Cache-Control": "no-store" } });
}
