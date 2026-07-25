import { NextResponse } from "next/server";

/**
 * Returns the server's current timestamp.
 * Used by the client to calculate a time offset so the timer
 * is not dependent on the client's system clock.
 * No auth required — needs to be fast and called on every page load.
 */
export async function GET() {
  const serverTime = Date.now();
  return NextResponse.json({
    serverTime,
    timestamp: new Date(serverTime).toISOString(),
  });
}
