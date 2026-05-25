import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { vibeServerClient } from "@/lib/vibe-server-client";

export function formatShortTime(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { completedMs, remainingMs } = await request.json();

    const targetUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, notificationsEnabled: true, notifyConstant: true },
    });

    if (targetUser?.email && targetUser?.notificationsEnabled && targetUser?.notifyConstant) {
      if (vibeServerClient) {
        const completedStr = formatShortTime(completedMs);
        const remainingStr = formatShortTime(remainingMs);
        await vibeServerClient.notification({
          notificationData: {
            title: "Work Tracker Progress",
            body: `You have completed ${completedStr}, ${remainingStr} left.`,
          },
          externalUsers: [targetUser.email],
        });
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to process progress notification:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
