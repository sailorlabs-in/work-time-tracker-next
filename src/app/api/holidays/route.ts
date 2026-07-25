import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const targetUserId = searchParams.get("userId") || session.user.id;

    let whereClause: Record<string, unknown> = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        whereClause = {
          date: {
            gte: start,
            lte: end,
          },
        };
      }
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { useServerPolicy: true },
    });

    if (targetUser && !targetUser.useServerPolicy) {
      const userHolidays = await prisma.userHoliday.findMany({
        where: { userId: targetUserId, ...whereClause },
        orderBy: { date: "desc" },
      });
      return NextResponse.json(userHolidays);
    }

    const holidays = await prisma.holiday.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
    });

    return NextResponse.json(holidays);
  } catch (error) {
    console.error("Fetch holidays error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
