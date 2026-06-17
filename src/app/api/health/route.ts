import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Lightweight server-alive probe. No auth required.
 * Used by useOnlineStatus to distinguish "no network" from "server down".
 */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
