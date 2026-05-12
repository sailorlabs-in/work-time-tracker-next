import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface TimerLog {
  type: string;
  time: number;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logs } = (await req.json()) as { logs: TimerLog[] };
    if (!logs || !Array.isArray(logs)) {
      return NextResponse.json({ error: "Invalid logs" }, { status: 400 });
    }

    // 1. Identify today's range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 2. Clear today's existing logs to overwrite
    await prisma.workLog.deleteMany({
      where: {
        userId: session.user.id,
        date: { gte: todayStart, lte: todayEnd },
      },
    });

    // 3. Build session pairs from logs
    // Sort ascending to process pairs
    const sorted = [...logs].sort((a, b) => a.time - b.time);
    const sessions: { punchIn: Date; punchOut: Date | null }[] = [];
    let currentIn: Date | null = null;

    for (const log of sorted) {
      if (log.type === "Start" || log.type === "Punch In (Work)") {
        currentIn = new Date(log.time);
      } else if (log.type === "Punch Out (Break)" && currentIn !== null) {
        sessions.push({ punchIn: currentIn, punchOut: new Date(log.time) });
        currentIn = null;
      }
    }

    // If there's a trailing punch-in, it's an active session
    if (currentIn !== null) {
      sessions.push({ punchIn: currentIn, punchOut: null });
    }

    // 4. Batch create new worklogs
    if (sessions.length > 0) {
      await prisma.$transaction(
        sessions.map((s) => {
          const durationHours = s.punchOut 
            ? (s.punchOut.getTime() - s.punchIn.getTime()) / 3600000 
            : null;
            
          return prisma.workLog.create({
            data: {
              userId: session.user.id,
              date: todayStart,
              punchIn: s.punchIn,
              punchOut: s.punchOut,
              totalHours: durationHours ? parseFloat(durationHours.toFixed(2)) : null,
              status: s.punchOut ? "completed" : "active",
            },
          });
        })
      );
    }

    return NextResponse.json({ success: true, count: sessions.length });
  } catch (error) {
    console.error("[sync] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
