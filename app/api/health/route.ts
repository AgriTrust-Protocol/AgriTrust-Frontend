import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Used by Kubernetes probes and the mesh rollout analysis.  It deliberately
 * does not call downstream services: a failed dependency must not cause every
 * frontend pod to be removed from service.
 */
export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "agritrust-frontend",
      version: process.env.APP_VERSION ?? "unknown",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
