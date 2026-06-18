import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/worklog/add-break
 *
 * Inserts a historical break into the database by splitting the active work session.
 *
 * Before:  [active log: punchIn=A, punchOut=null]
 * After:   [completed log: punchIn=A, punchOut=breakStart]
 *          [new active log: punchIn=breakEnd, punchOut=null]
 *
 * This keeps the DB in perfect sync with the timer state, so the calendar
 * shows the break properly.
 *
 * If there is no active log (rare: e.g. a completed-day manual entry),
 * we instead look for the most recent completed log on the same day and
 * create two new completed logs surrounding the break.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { breakStart, breakEnd } = body as {
      breakStart: string;
      breakEnd: string;
    };

    if (!breakStart || !breakEnd) {
      return NextResponse.json(
        { error: "Missing breakStart or breakEnd" },
        { status: 400 },
      );
    }

    const breakStartMs = new Date(breakStart).getTime();
    const breakEndMs = new Date(breakEnd).getTime();

    if (breakStartMs >= breakEndMs) {
      return NextResponse.json(
        { error: "breakStart must be before breakEnd" },
        { status: 400 },
      );
    }

    const now = new Date();
    if (breakEndMs > now.getTime()) {
      return NextResponse.json(
        { error: "breakEnd cannot be in the future" },
        { status: 400 },
      );
    }

    // Find any work log for this user today that contains/covers the break period.
    // A work log contains the break if its punchIn is strictly before the breakStart,
    // and its punchOut is either null (active) or strictly after breakEnd.
    const targetLog = await prisma.workLog.findFirst({
      where: {
        userId: session.user.id,
        punchIn: { lt: new Date(breakStart) },
        OR: [
          { punchOut: null },
          { punchOut: { gt: new Date(breakEnd) } },
        ],
      },
      orderBy: { punchIn: "desc" },
    });

    if (targetLog) {
      const isCompleted = targetLog.status === "completed";
      const originalPunchOut = targetLog.punchOut;

      await prisma.$transaction([
        // 1. Close/Update the target log to end at breakStart
        prisma.workLog.update({
          where: { id: targetLog.id },
          data: {
            punchOut: new Date(breakStart),
            totalHours: parseFloat(
              (
                (breakStartMs - targetLog.punchIn.getTime()) /
                3_600_000
              ).toFixed(4),
            ),
            status: "completed",
          },
        }),
        // 2. Create a new log starting at breakEnd
        prisma.workLog.create({
          data: {
            userId: session.user.id,
            date: targetLog.date,
            punchIn: new Date(breakEnd),
            punchOut: originalPunchOut,
            totalHours: originalPunchOut
              ? parseFloat(
                  (
                    (originalPunchOut.getTime() - breakEndMs) /
                    3_600_000
                  ).toFixed(4),
                )
              : null,
            status: isCompleted ? "completed" : "active",
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        mode: isCompleted ? "split-completed" : "split-active",
      });
    }

    return NextResponse.json(
      { error: "No overlapping work session found today to add a break." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[add-break] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
