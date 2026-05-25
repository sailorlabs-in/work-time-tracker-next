import { prisma } from "@/lib/db";
import { TimerState, TimerStatus, TimerLog } from "@/hooks/useWorkTimer";

export async function getTimerState(
  userId: string,
): Promise<TimerState | null> {
  try {
    const timerState = await prisma.timerState.findUnique({
      where: { userId },
    });

    if (!timerState) {
      return null;
    }

    // Convert BigInt to number for JSON serialization
    return {
      ...timerState,
      startTime: timerState.startTime ? Number(timerState.startTime) : null,
      targetWorkMs: Number(timerState.targetWorkMs),
      targetBreakMs: Number(timerState.targetBreakMs),
      accumulatedWorkMs: Number(timerState.accumulatedWorkMs),
      accumulatedBreakMs: Number(timerState.accumulatedBreakMs),
      lastStatusChange: timerState.lastStatusChange
        ? Number(timerState.lastStatusChange)
        : null,
      status: timerState.status as TimerStatus,
      logs: timerState.logs as unknown as TimerLog[],
      hasFiredOtNotification: timerState.hasFiredOtNotification,
      lastNotifiedInterval: timerState.lastNotifiedInterval,
    };
  } catch (error) {
    console.error("Get timer state error:", error);
    return null;
  }
}

export async function getUserProfile(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        timeFormat: true,
        workHours: true,
        workMinutes: true,
        breakMinutes: true,
        notificationsEnabled: true,
        notifyOnCompletion: true,
        notifyConstant: true,
        notifyInterval: true,
      }
    });
    return user;
  } catch (error) {
    console.error("Get user profile error:", error);
    return null;
  }
}

export async function getHolidays(startDate?: string, endDate?: string) {
  try {
    const where: Record<string, unknown> = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        where.date = {
          gte: start,
          lte: end,
        };
      }
    }

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: "asc" },
    });

    return holidays.map((h) => ({
      ...h,
      date: h.date.toISOString(),
      createdAt: h.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("Get holidays error:", error);
    return [];
  }
}

export async function getWorkLogs(
  userId: string,
  startDate?: string,
  endDate?: string,
) {
  try {
    const where: Record<string, unknown> = { userId };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Only apply date filter if both dates are valid
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        where.date = {
          gte: start,
          lte: end,
        };
      }
    }

    const logs = await prisma.workLog.findMany({
      where,
      orderBy: { punchIn: "asc" },
    });

    // Deduplicate logs based on punchIn time
    const uniqueLogsMap = new Map<string, (typeof logs)[0]>();

    logs.forEach((log) => {
      const key = log.punchIn.toISOString();
      if (!uniqueLogsMap.has(key)) {
        uniqueLogsMap.set(key, log);
      } else {
        const existing = uniqueLogsMap.get(key)!;
        if (existing.status === "active" && log.status === "completed") {
          uniqueLogsMap.set(key, log);
        } else if (existing.status === log.status) {
          if (
            new Date(log.updatedAt).getTime() >
            new Date(existing.updatedAt).getTime()
          ) {
            uniqueLogsMap.set(key, log);
          }
        }
      }
    });

    const logsSorted = Array.from(uniqueLogsMap.values()).sort(
      (a, b) => new Date(a.punchIn).getTime() - new Date(b.punchIn).getTime(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = [];
    const now = new Date();

    logsSorted.forEach((log, index) => {
      // 1. Work Event
      const isActive = log.status === "active";
      const workEnd = log.punchOut ? new Date(log.punchOut) : now;

      let durationMs = 0;
      if (log.totalHours !== null) {
        durationMs = log.totalHours * 3600000;
      } else {
        durationMs = now.getTime() - new Date(log.punchIn).getTime();
      }

      const hoursDisplay = (durationMs / 3600000).toFixed(1);

      events.push({
        id: `work-${log.id}`,
        title: `Work: ${hoursDisplay}h${isActive ? " 🟢" : ""}`,
        start: log.punchIn.toISOString(),
        end: workEnd.toISOString(),
        backgroundColor: isActive
          ? "rgba(0, 230, 118, 0.15)"
          : "rgba(138, 43, 226, 0.15)",
        borderColor: isActive
          ? "rgba(0, 230, 118, 0.5)"
          : "rgba(138, 43, 226, 0.4)",
        textColor: isActive ? "#00e676" : "#c4a1e8",
        extendedProps: {
          log: {
            ...log,
            punchIn: log.punchIn.toISOString(),
            punchOut: log.punchOut ? log.punchOut.toISOString() : null,
            date: log.date.toISOString(),
            createdAt: log.createdAt.toISOString(),
            updatedAt: log.updatedAt.toISOString(),
          },
          type: "work",
          isActive: isActive,
        },
      });

      // 2. Break Event
      const nextLog = logsSorted[index + 1];
      if (log.punchOut && nextLog) {
        const currentOut = new Date(log.punchOut);
        const nextIn = new Date(nextLog.punchIn);

        if (
          currentOut.toDateString() === nextIn.toDateString() &&
          nextIn.getTime() > currentOut.getTime()
        ) {
          const breakDiff = nextIn.getTime() - currentOut.getTime();
          const breakMinutes = Math.floor(breakDiff / 60000);

          if (breakMinutes > 0) {
            events.push({
              id: `break-${log.id}-${nextLog.id}`,
              title: `Break: ${Math.floor(breakMinutes / 60)}h ${breakMinutes % 60}m`,
              start: log.punchOut.toISOString(),
              end: nextLog.punchIn.toISOString(),
              backgroundColor: "rgba(255, 167, 38, 0.15)",
              borderColor: "rgba(255, 167, 38, 0.4)",
              textColor: "#ffa726",
              extendedProps: {
                log: {
                  ...log,
                  punchIn: log.punchIn.toISOString(),
                  punchOut: log.punchOut ? log.punchOut.toISOString() : null,
                  date: log.date.toISOString(),
                  createdAt: log.createdAt.toISOString(),
                  updatedAt: log.updatedAt.toISOString(),
                },
                type: "break",
                previousLogId: log.id,
                nextLogId: nextLog.id,
              },
            });
          }
        }
      }
    });

    return events;
  } catch (error) {
    console.error("Fetch logs error:", error);
    return [];
  }
}
