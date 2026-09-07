import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/worklog/delete-session
 *
 * Handler for clearing day records from the calendar.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body as { action?: string };

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      { error: "Invalid action. Use 'clear-day'." },
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
