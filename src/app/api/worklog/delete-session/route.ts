import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/worklog/delete-session
 *
 * Unified session deletion handler for the calendar.
 *
 * BREAK DELETION ("delete-break"):
 *   - Breaks are virtual (gaps between work log rows). To delete a break we:
 *     1. Extend prevLog.punchOut → nextLog.punchOut (merging the two work sessions)
 *     2. Delete nextLog
 *   - Net DB change: −1 row (nextLog is gone, prevLog is extended)
 *
 * WORK SESSION DELETION ("delete-work"):
 *   - Simply delete the target log row.
 *   - Any surrounding sessions remain intact. The new gap between them
 *     will automatically render as a break in the UI (since breaks = gaps).
 *   - Net DB change: −1 row
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body as { action: "delete-break" | "delete-work" };

    // ── DELETE BREAK ─────────────────────────────────────────────────────────
    if (action === "delete-break") {
      const { previousLogId, nextLogId } = body as {
        action: "delete-break";
        previousLogId: string;
        nextLogId: string;
      };

      if (!previousLogId || !nextLogId) {
        return NextResponse.json(
          { error: "Missing previousLogId or nextLogId" },
          { status: 400 },
        );
      }

      const [prevLog, nextLog] = await Promise.all([
        prisma.workLog.findUnique({ where: { id: previousLogId } }),
        prisma.workLog.findUnique({ where: { id: nextLogId } }),
      ]);

      if (!prevLog || !nextLog) {
        return NextResponse.json(
          { error: "One or both logs not found" },
          { status: 404 },
        );
      }

      if (
        prevLog.userId !== session.user.id ||
        nextLog.userId !== session.user.id
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Merge: prevLog gets extended to cover nextLog's end time
      const newPunchOut = nextLog.punchOut; // null if nextLog is still active
      const newStatus = nextLog.status === "active" ? "active" : "completed";

      let newTotalHours: number | null = null;
      if (newPunchOut) {
        const durationMs =
          new Date(newPunchOut).getTime() - new Date(prevLog.punchIn).getTime();
        newTotalHours = parseFloat((durationMs / 3_600_000).toFixed(4));
      }

      await prisma.$transaction([
        prisma.workLog.update({
          where: { id: previousLogId },
          data: {
            punchOut: newPunchOut,
            totalHours: newTotalHours,
            status: newStatus,
          },
        }),
        prisma.workLog.delete({ where: { id: nextLogId } }),
      ]);

      return NextResponse.json({
        success: true,
        merged: { prevLogId: previousLogId, deletedLogId: nextLogId },
      });
    }

    // ── DELETE WORK SESSION ───────────────────────────────────────────────────
    if (action === "delete-work") {
      const { logId } = body as { action: "delete-work"; logId: string };

      if (!logId) {
        return NextResponse.json({ error: "Missing logId" }, { status: 400 });
      }

      const log = await prisma.workLog.findUnique({ where: { id: logId } });

      if (!log) {
        return NextResponse.json({ error: "Log not found" }, { status: 404 });
      }

      if (log.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await prisma.workLog.delete({ where: { id: logId } });

      return NextResponse.json({ success: true, deletedLogId: logId });
    }

    // ── CLEAR DAY ────────────────────────────────────────────────────────────
    if (action === "clear-day") {
      const { date, isToday } = body as {
        action: "clear-day";
        date: string;
        isToday: boolean;
      };

      if (!date) {
        return NextResponse.json({ error: "Missing date" }, { status: 400 });
      }

      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59.999`);

      const whereClause: any = {
        userId: session.user.id,
        date: { gte: dayStart, lte: dayEnd },
      };

      if (isToday) {
        whereClause.status = { not: "active" };
      }

      const { count } = await prisma.workLog.deleteMany({
        where: whereClause,
      });

      if (!isToday) {
        const timerState = await prisma.timerState.findUnique({
          where: { userId: session.user.id },
        });
        if (timerState && timerState.startTime) {
          const startTimeMs = Number(timerState.startTime);
          const startDayStr = new Date(startTimeMs).toISOString().split("T")[0];
          if (startDayStr === date) {
            await prisma.timerState.delete({
              where: { userId: session.user.id },
            });
          }
        }
      }

      return NextResponse.json({ success: true, deletedCount: count });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'delete-break', 'delete-work' or 'clear-day'." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[delete-session] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

