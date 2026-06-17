import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { vibeServerClient } from "@/lib/vibe-server-client";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a Date representing the start of "yesterday" in IST at 00:00:00 IST,
 * useful for querying autoStoppedAt timestamps that fall in the previous IST day.
 * IST = UTC+5:30
 */
function getYesterdayISTWindow(): { from: Date; to: Date } {
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(nowUTC.getTime() + istOffsetMs);

  // Yesterday in IST
  const yesterdayIST = new Date(nowIST);
  yesterdayIST.setUTCDate(yesterdayIST.getUTCDate() - 1);

  // Yesterday IST start (00:00:00 IST) → in UTC
  const fromUTC = new Date(
    Date.UTC(
      yesterdayIST.getUTCFullYear(),
      yesterdayIST.getUTCMonth(),
      yesterdayIST.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - istOffsetMs,
  );

  // Yesterday IST end (23:59:59 IST) → in UTC
  const toUTC = new Date(
    Date.UTC(
      yesterdayIST.getUTCFullYear(),
      yesterdayIST.getUTCMonth(),
      yesterdayIST.getUTCDate(),
      23,
      59,
      59,
      999,
    ) - istOffsetMs,
  );

  return { from: fromUTC, to: toUTC };
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/cron/forgotten-timer-reminder
 * Called at 9:00 AM IST daily by an external cron scheduler.
 * Sends a push notification to users whose timer was auto-stopped last night,
 * then clears their autoStoppedAt flag.
 *
 * Secured by: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  // 1. Auth check
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Find users whose timer was auto-stopped yesterday (IST day)
    const { from, to } = getYesterdayISTWindow();

    const affectedUsers = await prisma.user.findMany({
      where: {
        autoStoppedAt: { gte: from, lte: to },
        notificationsEnabled: true,
      },
      select: { id: true, email: true, autoStoppedAt: true },
    });

    if (affectedUsers.length === 0) {
      return NextResponse.json({
        success: true,
        notified: 0,
        message: "No users with forgotten timers from yesterday.",
      });
    }

    const results = { notified: 0, errors: 0 };

    for (const user of affectedUsers) {
      try {
        if (!user.email) continue;

        // 3. Send push notification
        if (vibeServerClient) {
          await vibeServerClient.notification({
            notificationData: {
              title: "Forgot to stop your timer? ⏰",
              body: "You forgot to stop last timer. Please update the time.",
            },
            externalUsers: [user.email],
          });
          results.notified++;
        }

        // 4. Clear the autoStoppedAt flag
        await prisma.user.update({
          where: { id: user.id },
          data: { autoStoppedAt: null },
        });

        console.log(
          `[cron/forgotten-timer-reminder] Reminded user ${user.id} (${user.email}).`,
        );
      } catch (err) {
        console.error(
          `[cron/forgotten-timer-reminder] Error for user ${user.id}:`,
          err,
        );
        results.errors++;
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("[cron/forgotten-timer-reminder] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
