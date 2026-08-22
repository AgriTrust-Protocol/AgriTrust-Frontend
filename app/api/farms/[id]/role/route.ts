// app/api/farms/[id]/role/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { FarmRole } from "@/src/types/farm";

/**
 * TODO: replace with a real farm_members lookup once the DB schema lands.
 * For now, resolves role from a static map keyed by wallet address so the
 * frontend has a real endpoint to integrate against.
 */
const MOCK_ROLE_ASSIGNMENTS: Record<string, FarmRole> = {};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: farmId } = await params;
  const address = request.headers.get("x-wallet-address");

  if (!address) {
    return NextResponse.json(
      { error: "Missing x-wallet-address header" },
      { status: 401 }
    );
  }

  const key = `${farmId}:${address.toLowerCase()}`;
  const role = MOCK_ROLE_ASSIGNMENTS[key] ?? "Viewer";

  return NextResponse.json({ role });
}
