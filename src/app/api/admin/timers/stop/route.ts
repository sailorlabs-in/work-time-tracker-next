import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/admin/timers/stop
 * Allows an admin to stop a running timer that has been running for more than 12 hours.
 * The timer's last open entry will be stopped on the calendar day where the timer started
 * at 23:59:00 IST.
 *
 * Body: { userId: string }
 */
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session || !session.user || !session.user.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    // 1. Fetch user, timerState, and any active worklog
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        timerState: {
          select: {
            id: true,
            isActive: true,
            startTime: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const timerState = user.timerState;
    const activeLog = await prisma.workLog.findFirst({
      where: { userId, status: "active", punchOut: null },
      orderBy: { punchIn: "desc" },
    });

    const isTimerActive = Boolean(timerState?.isActive || activeLog);
    if (!isTimerActive) {
      return NextResponse.json(
        { error: "This user does not have an active running timer." },
        { status: 400 },
      );
    }

    // 2. Determine when the timer first started
    let startMs: number | null = null;
    if (timerState?.startTime) {
      startMs = Number(timerState.startTime);
    } else if (activeLog?.punchIn) {
      startMs = new Date(activeLog.punchIn).getTime();
    }

    if (!startMs) {
      startMs = Date.now();
    }

    // 3. Determine if timer exceeded 12 hours
    const now = Date.now();
    const runningDurationMs = now - startMs;
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const isOver12h = runningDurationMs >= twelveHoursMs;

    const startDate = new Date(startMs);
    const istOffsetMs = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const startIST = new Date(startDate.getTime() + istOffsetMs);

    let punchOutTime: Date;

    if (isOver12h) {
      // 4a. If timer exceeded 12 hours, stop on the calendar day where timer started at 23:59:00 IST
      const eodIST = new Date(
        Date.UTC(
          startIST.getUTCFullYear(),
          startIST.getUTCMonth(),
          startIST.getUTCDate(),
          23,
          59,
          0,
          0,
        ),
      );
      punchOutTime = new Date(eodIST.getTime() - istOffsetMs);

      // Safeguard: Ensure punchOutTime is strictly after activeLog.punchIn
      if (activeLog && punchOutTime <= new Date(activeLog.punchIn)) {
        const punchInDate = new Date(activeLog.punchIn);
        const logStartIST = new Date(punchInDate.getTime() + istOffsetMs);
        const logEodIST = new Date(
          Date.UTC(
            logStartIST.getUTCFullYear(),
            logStartIST.getUTCMonth(),
            logStartIST.getUTCDate(),
            23,
            59,
            0,
            0,
          ),
        );
        const altPunchOut = new Date(logEodIST.getTime() - istOffsetMs);
        punchOutTime =
          altPunchOut > punchInDate
            ? altPunchOut
            : new Date(punchInDate.getTime() + 60 * 1000);
      }
    } else {
      // 4b. If timer has not exceeded 12 hours, stop at the exact time admin clicked stop
      punchOutTime = new Date(now);

      if (activeLog && punchOutTime <= new Date(activeLog.punchIn)) {
        punchOutTime = new Date(new Date(activeLog.punchIn).getTime() + 60 * 1000);
      }
    }

    // 5. Update or close the last entry (active WorkLog)
    if (activeLog) {
      const punchInTime = new Date(activeLog.punchIn);
      const durationMs = Math.max(0, punchOutTime.getTime() - punchInTime.getTime());
      const totalHours = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2));

      await prisma.workLog.update({
        where: { id: activeLog.id },
        data: {
          punchOut: punchOutTime,
          totalHours,
          status: "completed",
        },
      });
    } else {
      // If timerState was active but no DB activeLog record existed, create the completed entry for the start day
      const punchInTime = new Date(startMs);
      if (punchOutTime > punchInTime) {
        const durationMs = punchOutTime.getTime() - punchInTime.getTime();
        const totalHours = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2));
        const dateMidnight = new Date(
          Date.UTC(
            startIST.getUTCFullYear(),
            startIST.getUTCMonth(),
            startIST.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );

        await prisma.workLog.create({
          data: {
            userId,
            date: dateMidnight,
            punchIn: punchInTime,
            punchOut: punchOutTime,
            totalHours,
            status: "completed",
          },
        });
      }
    }

    // 6. Delete the user's active timer state
    await prisma.timerState.deleteMany({
      where: { userId },
    });

    // 7. Record autoStoppedAt timestamp on the user
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { autoStoppedAt: new Date() },
        select: { id: true },
      });
    } catch (e) {
      console.warn("Could not update autoStoppedAt on user:", e);
    }

    const startDayFormatted = startIST.toISOString().split("T")[0];
    const message = isOver12h
      ? `Timer stopped on start day (${startDayFormatted}) at 23:59:00 IST`
      : `Timer stopped at current time (${punchOutTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;

    return NextResponse.json({
      success: true,
      message,
      isOver12h,
      startDay: startDayFormatted,
      punchOut: punchOutTime.toISOString(),
    });
  } catch (error) {
    console.error("Failed to stop user timer (admin):", error);
    return NextResponse.json(
      { error: "Failed to stop user timer" },
      { status: 500 },
    );
  }
}
