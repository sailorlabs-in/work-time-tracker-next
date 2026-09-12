import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();

  if (!session || !session.user || !session.user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        workHours: true,
        workMinutes: true,
        createdAt: true,
        timerState: {
          select: {
            isActive: true,
            status: true,
            startTime: true,
            accumulatedWorkMs: true,
            lastStatusChange: true,
          },
        },
        workLogs: {
          where: { status: "active", punchOut: null },
          orderBy: { punchIn: "desc" },
          take: 1,
          select: { id: true, punchIn: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;

    const formattedUsers = users.map((u) => {
      const timer = u.timerState;
      const activeLog = u.workLogs[0];
      const isTimerActive = Boolean(timer?.isActive || activeLog);

      let startTimeNum: number | null = null;
      if (timer?.startTime) {
        startTimeNum = Number(timer.startTime);
      } else if (activeLog?.punchIn) {
        startTimeNum = new Date(activeLog.punchIn).getTime();
      }

      const elapsedMs = isTimerActive && startTimeNum ? Math.max(0, now - startTimeNum) : 0;
      const isRunningOver12h = isTimerActive && elapsedMs >= twelveHoursMs;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isAdmin: u.isAdmin,
        workHours: u.workHours,
        workMinutes: u.workMinutes,
        createdAt: u.createdAt,
        activeTimer: isTimerActive
          ? {
              isActive: true,
              status: timer?.status || "working",
              startTime: startTimeNum,
              elapsedMs,
              isRunningOver12h,
            }
          : null,
      };
    });

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error("Failed to fetch users (admin):", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}
