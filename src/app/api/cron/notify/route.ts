import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { vibeServerClient } from "@/lib/vibe-server-client";
import { CustomNotification } from "@/hooks/useWorkTimer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatShortTime(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function timeStrToMs(val: string): number {
  const [h, m] = val.split(":").map(Number);
  return (h * 60 + m) * 60 * 1000;
}

function getCurrentISTTimeStr(): string {
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const nowIST = new Date(nowUTC.getTime() + istOffsetMs);
  const h = String(nowIST.getUTCHours()).padStart(2, "0");
  const m = String(nowIST.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Returns true if current IST time is between 07:00 and 20:00 (inclusive).
 * IST = UTC+5:30
 */
function isWithinISTWorkingHours(): boolean {
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // +5:30
  const nowIST = new Date(nowUTC.getTime() + istOffsetMs);
  const istHour = nowIST.getUTCHours();
  const istMinute = nowIST.getUTCMinutes();
  const totalISTMinutes = istHour * 60 + istMinute;
  // 07:00 = 420 minutes, 20:00 = 1200 minutes
  return totalISTMinutes >= 420 && totalISTMinutes < 1200;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET and POST /api/cron/notify
 * Called every minute by an external cron scheduler.
 * Sends progress + completion push notifications for all active timers.
 * Only fires between IST 07:00–20:00.
 *
 * Secured by: Authorization: Bearer <CRON_SECRET> or ?secret=<CRON_SECRET>
 */
export async function GET(req: Request) {
  return handleNotify(req);
}

export async function POST(req: Request) {
  return handleNotify(req);
}

async function handleNotify(req: Request) {
  // 1. Auth check
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. IST window check
  if (!isWithinISTWorkingHours()) {
    return NextResponse.json({
      skipped: true,
      reason: "Outside IST 07:00–20:00 window",
    });
  }

  const nowMs = Date.now();

  try {
    // 3. Fetch all active timers with user notification prefs
    const activeTimers = await prisma.timerState.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: {
            email: true,
            notificationsEnabled: true,
            notifyOnCompletion: true,
            notifyConstant: true,
            notifyInterval: true,
          },
        },
      },
    });

    const results = {
      processed: 0,
      completionSent: 0,
      progressSent: 0,
      errors: 0,
    };

    for (const timer of activeTimers) {
      results.processed++;

      const { user } = timer;
      if (!user.notificationsEnabled || !user.email) continue;

      const lastStatusChangeMs = timer.lastStatusChange ? Number(timer.lastStatusChange) : 0;
      const currentSessionWork =
        timer.status === "working" && lastStatusChangeMs
          ? nowMs - lastStatusChangeMs
          : 0;
      const totalWorkNow = Number(timer.accumulatedWorkMs) + currentSessionWork;
      const targetWorkMs = Number(timer.targetWorkMs);

      try {
        // ── Standard Completion Notification ───────────────────────────────────
        if (
          timer.status === "working" &&
          user.notifyOnCompletion &&
          !timer.hasFiredOtNotification &&
          targetWorkMs > 0 &&
          totalWorkNow >= targetWorkMs
        ) {
          if (vibeServerClient) {
            await vibeServerClient.notification({
              notificationData: {
                title: "Workday Complete! 🎉",
                body: "You have completed your target hours and are now entering Overtime.",
              },
              externalUsers: [user.email],
            });
            results.completionSent++;
          }

          // Mark as fired in DB
          await prisma.timerState.update({
            where: { id: timer.id },
            data: { hasFiredOtNotification: true },
          });
        }

        // ── Standard Progress / Interval Notification ─────────────────────────
        if (
          timer.status === "working" &&
          user.notifyConstant &&
          targetWorkMs > 0 &&
          totalWorkNow < targetWorkMs
        ) {
          const intervalMs = (user.notifyInterval ?? 30) * 60 * 1000;
          const currentMultiple = Math.floor(totalWorkNow / intervalMs);
          const lastNotified = timer.lastNotifiedInterval ?? 0;

          if (currentMultiple > lastNotified) {
            const remaining = targetWorkMs - totalWorkNow;

            if (vibeServerClient) {
              await vibeServerClient.notification({
                notificationData: {
                  title: "Work Tracker Progress ⏱️",
                  body: `You have completed ${formatShortTime(totalWorkNow)}, ${formatShortTime(remaining)} left.`,
                },
                externalUsers: [user.email],
              });
              results.progressSent++;
            }

            // Update lastNotifiedInterval in DB
            await prisma.timerState.update({
              where: { id: timer.id },
              data: { lastNotifiedInterval: currentMultiple },
            });
          }
        }

        // ── Custom Notifications from JSON List ──────────────────────────────
        const customNotifs = (timer.customNotifications as unknown as CustomNotification[]) || [];
        let didChange = false;

        for (const notif of customNotifs) {
          if (notif.hasFired) continue;

          if (notif.type === "time") {
            const currentISTTime = getCurrentISTTimeStr();
            if (currentISTTime >= notif.value) {
              if (vibeServerClient) {
                await vibeServerClient.notification({
                  notificationData: {
                    title: notif.title || "Clock Time Alert ⏰",
                    body: `It is now ${notif.value}.`,
                  },
                  externalUsers: [user.email],
                });
                results.progressSent++;
              }
              notif.hasFired = true;
              didChange = true;
            }
          } else if (notif.type === "complete") {
            const targetMs = timeStrToMs(notif.value);
            if (targetMs > 0 && totalWorkNow >= targetMs) {
              if (vibeServerClient) {
                await vibeServerClient.notification({
                  notificationData: {
                    title: "Goal Completed! 🎉",
                    body: `You completed your ${formatShortTime(targetMs)} target.`,
                  },
                  externalUsers: [user.email],
                });
                results.completionSent++;
              }
              notif.hasFired = true;
              didChange = true;
            }
          } else if (notif.type === "overtime") {
            const otMs = totalWorkNow - targetWorkMs;
            const otThresholdMs = timeStrToMs(notif.value);
            if (otMs >= otThresholdMs) {
              if (vibeServerClient) {
                await vibeServerClient.notification({
                  notificationData: {
                    title: "Overtime Alert! ⏱️",
                    body: `Your Overtime has reached ${formatShortTime(otThresholdMs)}.`,
                  },
                  externalUsers: [user.email],
                });
                results.progressSent++;
              }
              notif.hasFired = true;
              didChange = true;
            }
          } else if (notif.type === "punch_out") {
            if (timer.status === "break" && lastStatusChangeMs) {
              const breakDurationMs = nowMs - lastStatusChangeMs;
              const thresholdMs = timeStrToMs(notif.value);
              if (breakDurationMs >= thresholdMs) {
                if (vibeServerClient) {
                  await vibeServerClient.notification({
                    notificationData: {
                      title: "Break Time Alert! ⏱️",
                      body: `You have been punched out/on break for ${formatShortTime(thresholdMs)}.`,
                    },
                    externalUsers: [user.email],
                  });
                  results.progressSent++;
                }
                notif.hasFired = true;
                didChange = true;
              }
            }
          }
        }

        if (didChange) {
          await prisma.timerState.update({
            where: { id: timer.id },
            data: { customNotifications: customNotifs as any },
          });
        }

      } catch (err) {
        console.error(`[cron/notify] Error processing timer ${timer.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("[cron/notify] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
