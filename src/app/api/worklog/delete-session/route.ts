import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/worklog/delete-session
 *
 * Handler for clearing day records from the calendar.
 * Supports optional `targetUserId` for admin acting on behalf of another user.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, targetUserId } = body as {
      action?: string;
      targetUserId?: string;
    };

    // Resolve the effective user ID
    let effectiveUserId = session.user.id;
    if (targetUserId && targetUserId !== session.user.id) {
      // Verify that the caller is an admin before allowing cross-user operations
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
      effectiveUserId = targetUserId;
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

      // Use UTC-based date range to match how Prisma stores dates
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const whereClause: any = {
        userId: effectiveUserId,
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
          where: { userId: effectiveUserId },
        });
        if (timerState && timerState.startTime) {
          const startTimeMs = Number(timerState.startTime);
          const startDayStr = new Date(startTimeMs).toISOString().split("T")[0];
          if (startDayStr === date) {
            await prisma.timerState.delete({
              where: { userId: effectiveUserId },
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
