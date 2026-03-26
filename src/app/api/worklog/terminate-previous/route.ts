import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/worklog/terminate-previous
 * Terminates an active (overnight/stale) work log session with a user-specified end time.
 * Expects: { endTime: string } — ISO date string for the punch-out time.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { endTime } = body;

    if (!endTime) {
      return NextResponse.json(
        { error: "endTime is required" },
        { status: 400 },
      );
    }

    // Find the active work log (no punchOut)
    const activeLog = await prisma.workLog.findFirst({
      where: {
        userId: session.user.id,
        status: "active",
        punchOut: null,
      },
      orderBy: { punchIn: "desc" },
    });

    if (!activeLog) {
      // No active DB session, but still clear the timer state
      await prisma.timerState.deleteMany({
        where: { userId: session.user.id },
      });
      return NextResponse.json({
        success: true,
        message: "No active DB session found, but timer state was cleared.",
      });
    }

    const punchOutTime = new Date(endTime);
    const punchInTime = new Date(activeLog.punchIn);

    // Validate: punchOut must be after punchIn
    if (punchOutTime <= punchInTime) {
      return NextResponse.json(
        { error: "End time must be after the session start time" },
        { status: 400 },
      );
    }

    const durationMs = punchOutTime.getTime() - punchInTime.getTime();
    const hours = durationMs / (1000 * 60 * 60);

    // Update the work log with the punch-out, also update the date to match punchIn date
    const updatedLog = await prisma.workLog.update({
      where: { id: activeLog.id },
      data: {
        punchOut: punchOutTime,
        totalHours: parseFloat(hours.toFixed(2)),
        status: "completed",
      },
    });

    // Also clear the timer state
    await prisma.timerState.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      success: true,
      log: updatedLog,
    });
  } catch (error) {
    console.error("[terminate-previous] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
