import { NextResponse } from "next/server";
import { auditRuntimeConfig } from "@/src/lib/runtime-config/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Read-only runtime configuration audit endpoint for platform automation.
 * It exposes only allow-listed keys and redacts server-side secret values.
 */
export function GET() {
  const result = auditRuntimeConfig({
    env: process.env,
    expectedFingerprint: process.env.RUNTIME_CONFIG_BASELINE_FINGERPRINT,
  });

  return NextResponse.json(result, {
    status: result.compliant ? 200 : 409,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
