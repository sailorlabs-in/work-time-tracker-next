import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_WEEKEND_POLICY } from "@/lib/weekendPolicy";

/**
 * Returns the user's EFFECTIVE weekend policy and holidays.
 * - If useServerPolicy === true → admin's global WeekendPolicy + admin Holiday list
 * - If useServerPolicy === false → user's UserWeekendPolicy + UserHoliday list
 *
 * Response shape is the same regardless of source.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { useServerPolicy: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let weekendPolicy = {
      sundayOff: DEFAULT_WEEKEND_POLICY.sundayOff,
      saturdayRule: DEFAULT_WEEKEND_POLICY.saturdayRule,
      customSaturdays: DEFAULT_WEEKEND_POLICY.customSaturdays,
    };
    let holidays: Array<{
      id: string;
      name: string;
      date: string;
      durationMinutes: number | null;
    }> = [];

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        dateFilter.date = { gte: start, lte: end };
      }
    }

    if (user.useServerPolicy) {
      // Use admin's global policy
      const globalPolicy = await prisma.weekendPolicy.findFirst();
      if (globalPolicy) {
        weekendPolicy = {
          sundayOff: globalPolicy.sundayOff,
          saturdayRule: globalPolicy.saturdayRule,
          customSaturdays: globalPolicy.customSaturdays as number[],
        };
      }

      // Use admin's holidays
      const adminHolidays = await prisma.holiday.findMany({
        where: dateFilter,
        orderBy: { date: "desc" },
      });
      holidays = adminHolidays.map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date.toISOString(),
        durationMinutes: h.durationMinutes,
      }));
    } else {
      // Use user's custom policy
      const userPolicy = await prisma.userWeekendPolicy.findUnique({
        where: { userId: session.user.id },
      });
      if (userPolicy) {
        weekendPolicy = {
          sundayOff: userPolicy.sundayOff,
          saturdayRule: userPolicy.saturdayRule,
          customSaturdays: userPolicy.customSaturdays as number[],
        };
      }

      // Use user's custom holidays
      const userHolidays = await prisma.userHoliday.findMany({
        where: { userId: session.user.id, ...dateFilter },
        orderBy: { date: "desc" },
      });
      holidays = userHolidays.map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date.toISOString(),
        durationMinutes: h.durationMinutes,
      }));
    }

    return NextResponse.json({
      useServerPolicy: user.useServerPolicy,
      weekendPolicy,
      holidays,
    });
  } catch (error) {
    console.error("GET effective policy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
