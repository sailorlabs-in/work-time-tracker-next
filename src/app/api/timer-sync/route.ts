import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTimerState } from "@/lib/api-services";

// GET — Retrieve saved timer state
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const timerState = await getTimerState(session.user.id);

    return NextResponse.json(timerState);
  } catch (error) {
    console.error("Get timer state error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST — Save/sync timer state
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      isActive,
      startTime,
      targetWorkMs,
      targetBreakMs,
      accumulatedWorkMs,
      accumulatedBreakMs,
      lastStatusChange,
      status,
      logs,
      hasFiredOtNotification,
      lastNotifiedInterval,
      lastUpdated,
    } = body;

    const timerState = await prisma.timerState.upsert({
      where: { userId: session.user.id },
      update: {
        isActive: isActive ?? false,
        startTime: startTime ? BigInt(startTime) : null,
        targetWorkMs: BigInt(targetWorkMs || 0),
        targetBreakMs: BigInt(targetBreakMs || 0),
        accumulatedWorkMs: BigInt(accumulatedWorkMs || 0),
        accumulatedBreakMs: BigInt(accumulatedBreakMs || 0),
        lastStatusChange: lastStatusChange ? BigInt(lastStatusChange) : null,
        status: status || "idle",
        logs: logs || [],
        hasFiredOtNotification: hasFiredOtNotification ?? false,
        lastNotifiedInterval: lastNotifiedInterval ?? 0,
        lastUpdated: lastUpdated ? BigInt(lastUpdated) : BigInt(0),
      },
      create: {
        userId: session.user.id,
        isActive: isActive ?? false,
        startTime: startTime ? BigInt(startTime) : null,
        targetWorkMs: BigInt(targetWorkMs || 0),
        targetBreakMs: BigInt(targetBreakMs || 0),
        accumulatedWorkMs: BigInt(accumulatedWorkMs || 0),
        accumulatedBreakMs: BigInt(accumulatedBreakMs || 0),
        lastStatusChange: lastStatusChange ? BigInt(lastStatusChange) : null,
        status: status || "idle",
        logs: logs || [],
        hasFiredOtNotification: hasFiredOtNotification ?? false,
        lastNotifiedInterval: lastNotifiedInterval ?? 0,
        lastUpdated: lastUpdated ? BigInt(lastUpdated) : BigInt(0),
      },
    });

    return NextResponse.json({
      success: true,
      updatedAt: timerState.updatedAt,
    });
  } catch (error) {
    console.error("Sync timer state error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE — Clear timer state (on reset)
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.timerState.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete timer state error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
