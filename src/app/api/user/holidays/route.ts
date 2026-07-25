import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — Retrieve user's custom holidays
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = { userId: session.user.id };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        where.date = { gte: start, lte: end };
      }
    }

    const holidays = await prisma.userHoliday.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return NextResponse.json(holidays);
  } catch (error) {
    console.error("GET user holidays error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST — Add a custom holiday
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, date, durationMinutes } = body;

    if (!name || !date) {
      return NextResponse.json(
        { error: "Name and date are required" },
        { status: 400 },
      );
    }

    const holiday = await prisma.userHoliday.create({
      data: {
        userId: session.user.id,
        name,
        date: new Date(date),
        durationMinutes: durationMinutes ?? null,
      },
    });

    return NextResponse.json(holiday);
  } catch (error) {
    console.error("POST user holiday error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
