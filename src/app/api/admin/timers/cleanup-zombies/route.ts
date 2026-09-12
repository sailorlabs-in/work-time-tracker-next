import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/admin/timers/cleanup-zombies
 *
 * Finds and fixes "zombie" sessions: completed workLogs where the punchOut
 * timestamp falls on a different calendar day (UTC) than the session's `date`
 * field. This happens when the auto-close cron job was down and sessions
 * were stopped days later.
 *
 * Fix strategy: cap punchOut to 23:59:00 IST of the session's start day.
 * Also recalculates totalHours.
 *
 * Optional body: { userId } — if provided, only fix sessions for that user.
 * If omitted, fixes all users (admin-only).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin
    const callerUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    });
    if (!callerUser?.isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { userId: targetUserId } = body as { userId?: string };

    // Find all completed sessions where punchOut date != date field date
    // We'll fetch all completed sessions with punchOut set and filter in JS
    // (Prisma doesn't support cross-field date comparisons directly)
    const whereClause = {
      status: "completed",
      punchOut: { not: null },
      ...(targetUserId ? { userId: targetUserId } : {}),
    };

    const sessions = await prisma.workLog.findMany({
      where: whereClause,
      select: {
        id: true,
        userId: true,
        date: true,
        punchIn: true,
        punchOut: true,
        totalHours: true,
      },
    });

    // IST offset: UTC+5:30 = 330 minutes
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

    const zombies = sessions.filter((s) => {
      if (!s.punchOut) return false;
      // Compare date's day string with punchOut's date in IST
      const sessionDateStr = s.date.toISOString().split("T")[0];
      const punchOutDateStr = s.punchOut.toISOString().split("T")[0];
      return punchOutDateStr !== sessionDateStr;
    });

    if (zombies.length === 0) {
      return NextResponse.json({
        success: true,
        fixed: 0,
        message: "No zombie sessions found. Everything looks clean!",
      });
    }

    // Fix each zombie: cap punchOut to 23:59:00 IST of their start day
    const updates = await Promise.all(
      zombies.map(async (zombie) => {
        const sessionDateStr = zombie.date.toISOString().split("T")[0];

        // 23:59:00 IST = 23:59:00 UTC+5:30 = 18:29:00 UTC on same day
        const endOfDayIST = new Date(
          `${sessionDateStr}T23:59:00.000Z`,
        );
        // Subtract IST offset to get UTC time for 23:59:00 IST
        endOfDayIST.setTime(endOfDayIST.getTime() - IST_OFFSET_MS);

        const durationMs =
          endOfDayIST.getTime() - zombie.punchIn.getTime();
        const newTotalHours = Math.max(0, durationMs / 3600000);

        await prisma.workLog.update({
          where: { id: zombie.id },
          data: {
            punchOut: endOfDayIST,
            totalHours: parseFloat(newTotalHours.toFixed(4)),
          },
        });

        return {
          id: zombie.id,
          userId: zombie.userId,
          date: sessionDateStr,
          oldPunchOut: zombie.punchOut?.toISOString(),
          newPunchOut: endOfDayIST.toISOString(),
          newTotalHours: parseFloat(newTotalHours.toFixed(2)),
        };
      }),
    );

    return NextResponse.json({
      success: true,
      fixed: updates.length,
      message: `Fixed ${updates.length} zombie session${updates.length > 1 ? "s" : ""}.`,
      details: updates,
    });
  } catch (error) {
    console.error("[cleanup-zombies] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
