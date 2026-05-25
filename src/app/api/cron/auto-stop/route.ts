import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatShortTime(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Returns a Date object representing 23:59:00 IST for the current IST day.
 * IST = UTC+5:30
 */
function getEODInIST(): Date {
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(nowUTC.getTime() + istOffsetMs);

  // Build 23:59:00 on the current IST calendar day (in UTC representation)
  const eodIST = new Date(
    Date.UTC(
      nowIST.getUTCFullYear(),
      nowIST.getUTCMonth(),
      nowIST.getUTCDate(),
      23,
      59,
      0,
      0,
    ),
  );
  // Convert back to UTC by subtracting IST offset
  return new Date(eodIST.getTime() - istOffsetMs);
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/cron/auto-stop
 * Called at 11:59 PM IST daily by an external cron scheduler.
 * Auto-stops all running timers, closes open WorkLog records,
 * and marks users for the next-morning "forgotten timer" reminder.
 *
 * Secured by: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  // 1. Auth check
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const punchOutTime = getEODInIST(); // 23:59:00 IST expressed as UTC Date
  const now = new Date();

  try {
    // 2. Find all active timer states
    const activeTimers = await prisma.timerState.findMany({
      where: { isActive: true },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    if (activeTimers.length === 0) {
      return NextResponse.json({
        success: true,
        stopped: 0,
        message: "No active timers found.",
      });
    }

    const results = { stopped: 0, errors: 0, userIds: [] as string[] };

    for (const timer of activeTimers) {
      try {
        const userId = timer.userId;

        // 3a. Calculate total work time for this session
        let totalWorkMs = Number(timer.accumulatedWorkMs);
        if (timer.status === "working" && timer.lastStatusChange) {
          const sessionDuration =
            punchOutTime.getTime() - Number(timer.lastStatusChange);
          if (sessionDuration > 0) {
            totalWorkMs += sessionDuration;
          }
        }

        const totalHours = parseFloat(
          (totalWorkMs / (1000 * 60 * 60)).toFixed(2),
        );

        // 3b. Close open WorkLog record (if any)
        const activeLog = await prisma.workLog.findFirst({
          where: { userId, status: "active", punchOut: null },
          orderBy: { punchIn: "desc" },
        });

        if (activeLog) {
          const punchInTime = new Date(activeLog.punchIn);
          const durationMs = punchOutTime.getTime() - punchInTime.getTime();
          const logHours = parseFloat(
            (durationMs / (1000 * 60 * 60)).toFixed(2),
          );

          await prisma.workLog.update({
            where: { id: activeLog.id },
            data: {
              punchOut: punchOutTime,
              totalHours: logHours,
              status: "completed",
            },
          });
        }

        // 3c. Delete timer state (stops the timer)
        await prisma.timerState.delete({ where: { id: timer.id } });

        // 3d. Mark user with autoStoppedAt for the 9 AM reminder
        await prisma.user.update({
          where: { id: userId },
          data: { autoStoppedAt: now },
        });

        results.stopped++;
        results.userIds.push(userId);

        console.log(
          `[cron/auto-stop] Stopped timer for user ${userId}. Total work: ${formatShortTime(totalWorkMs)}.`,
        );
      } catch (err) {
        console.error(
          `[cron/auto-stop] Error stopping timer ${timer.id}:`,
          err,
        );
        results.errors++;
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("[cron/auto-stop] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
