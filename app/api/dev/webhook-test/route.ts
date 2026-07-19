import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({ message: "Webhook received" }));
  return NextResponse.json({ received: true, event: payload, receivedAt: new Date().toISOString() });
}
