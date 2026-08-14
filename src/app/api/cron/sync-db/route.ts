import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

function getPrismaForUrl(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * POST /api/cron/sync-db
 * Trigger database synchronization between Prod and Dev / Backup DBs.
 * 
 * Supports:
 * - Auth: Bearer <CRON_SECRET> or Admin session
 * - Direction: "prod-to-dev" (default) or "dev-to-prod"
 * - Mode: Incremental (defaults to last 24 hrs data) or fullSync
 * - Custom date range: { startDate, endDate }
 */
export async function POST(req: Request) {
  // 1. Authorization check (Cron Secret OR Admin User Session)
  let isAuthorized = false;
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { isAdmin: true },
        });
        if (user?.isAdmin) {
          isAuthorized = true;
        }
      }
    } catch {
      // Auth session check failed
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request body options (if any)
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional (e.g. cron triggers without body)
  }

  const direction: "prod-to-dev" | "dev-to-prod" =
    body.direction === "dev-to-prod" ? "dev-to-prod" : "prod-to-dev";
  const fullSync: boolean = body.fullSync === true;
  const { startDate, endDate } = body;

  // 3. Resolve database connection URLs
  const prodUrl = process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
  const devUrl = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL_BACKUP;

  const sourceUrl = direction === "dev-to-prod" ? devUrl : prodUrl;
  const targetUrl = direction === "dev-to-prod" ? prodUrl : devUrl;

  if (!sourceUrl || !targetUrl) {
    return NextResponse.json(
      {
        error: "Missing database configuration",
        details:
          "Source or Target database URL is not defined. Ensure DATABASE_URL and DATABASE_URL_BACKUP (or DATABASE_URL_DEV / DATABASE_URL_PROD) are set in environment variables.",
      },
      { status: 400 }
    );
  }

  if (sourceUrl === targetUrl) {
    return NextResponse.json(
      {
        error: "Invalid database configuration",
        details:
          "Source and Target database URLs are identical. Please specify distinct production and development/backup database URLs.",
      },
      { status: 400 }
    );
  }

  let sourcePrisma: PrismaClient | null = null;
  let targetPrisma: PrismaClient | null = null;

  try {
    // Instantiate connections
    sourcePrisma = sourceUrl === process.env.DATABASE_URL ? prisma : getPrismaForUrl(sourceUrl);
    targetPrisma = targetUrl === process.env.DATABASE_URL ? prisma : getPrismaForUrl(targetUrl);

    if (fullSync) {
      // FULL SYNC MODE: Sync all records across all tables
      const users = await sourcePrisma.user.findMany();
      const holidays = await sourcePrisma.holiday.findMany();
      const weekendPolicies = await sourcePrisma.weekendPolicy.findMany();
      const userWeekendPolicies = await sourcePrisma.userWeekendPolicy.findMany();
      const userHolidays = await sourcePrisma.userHoliday.findMany();
      const workLogs = await sourcePrisma.workLog.findMany();
      const timerStates = await sourcePrisma.timerState.findMany();
      const notifications = await sourcePrisma.notification.findMany();
      const dayNotes = await sourcePrisma.dayNote.findMany();

      await targetPrisma.$transaction([
        targetPrisma.timerState.deleteMany(),
        targetPrisma.workLog.deleteMany(),
        targetPrisma.notification.deleteMany(),
        targetPrisma.dayNote.deleteMany(),
        targetPrisma.userHoliday.deleteMany(),
        targetPrisma.userWeekendPolicy.deleteMany(),
        targetPrisma.user.deleteMany(),
        targetPrisma.holiday.deleteMany(),
        targetPrisma.weekendPolicy.deleteMany(),

        targetPrisma.user.createMany({ data: users }),
        targetPrisma.holiday.createMany({ data: holidays }),
        targetPrisma.weekendPolicy.createMany({ data: weekendPolicies as any[] }),
        targetPrisma.userWeekendPolicy.createMany({ data: userWeekendPolicies as any[] }),
        targetPrisma.userHoliday.createMany({ data: userHolidays }),
        targetPrisma.workLog.createMany({ data: workLogs }),
        targetPrisma.timerState.createMany({ data: timerStates as any[] }),
        targetPrisma.notification.createMany({ data: notifications }),
        targetPrisma.dayNote.createMany({ data: dayNotes }),
      ]);

      return NextResponse.json({
        success: true,
        message: "Full database synchronization completed successfully.",
        direction,
        syncType: "full",
        syncedCounts: {
          users: users.length,
          holidays: holidays.length,
          weekendPolicies: weekendPolicies.length,
          userWeekendPolicies: userWeekendPolicies.length,
          userHolidays: userHolidays.length,
          workLogs: workLogs.length,
          timerStates: timerStates.length,
          notifications: notifications.length,
          dayNotes: dayNotes.length,
        },
      });
    }

    // INCREMENTAL / DATE RANGE SYNC MODE (Defaults to last 24 hours if no dates provided)
    let startGte: Date;
    let endLte: Date;

    if (startDate) {
      startGte = new Date(startDate);
      if (isNaN(startGte.getTime())) {
        startGte = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }
    } else {
      // Default: Last 24 hours
      startGte = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    if (endDate) {
      // If end date string without time is passed (e.g. 2026-08-14), set to end of day
      if (endDate.length === 10) {
        endLte = new Date(`${endDate}T23:59:59.999Z`);
      } else {
        endLte = new Date(endDate);
      }
      if (isNaN(endLte.getTime())) {
        endLte = new Date();
      }
    } else {
      endLte = new Date();
    }

    // Query records in range from source DB
    const [
      workLogs,
      timerStates,
      notifications,
      dayNotes,
      holidays,
      userHolidays,
      userWeekendPolicies,
      weekendPolicies,
    ] = await Promise.all([
      sourcePrisma.workLog.findMany({
        where: {
          OR: [
            { createdAt: { gte: startGte, lte: endLte } },
            { updatedAt: { gte: startGte, lte: endLte } },
            { date: { gte: startGte, lte: endLte } },
          ],
        },
      }),
      sourcePrisma.timerState.findMany({
        where: { updatedAt: { gte: startGte, lte: endLte } },
      }),
      sourcePrisma.notification.findMany({
        where: { createdAt: { gte: startGte, lte: endLte } },
      }),
      sourcePrisma.dayNote.findMany({
        where: {
          OR: [
            { createdAt: { gte: startGte, lte: endLte } },
            { updatedAt: { gte: startGte, lte: endLte } },
            { date: { gte: startGte, lte: endLte } },
          ],
        },
      }),
      sourcePrisma.holiday.findMany({
        where: {
          OR: [
            { createdAt: { gte: startGte, lte: endLte } },
            { date: { gte: startGte, lte: endLte } },
          ],
        },
      }),
      sourcePrisma.userHoliday.findMany({
        where: {
          OR: [
            { createdAt: { gte: startGte, lte: endLte } },
            { date: { gte: startGte, lte: endLte } },
          ],
        },
      }),
      sourcePrisma.userWeekendPolicy.findMany({
        where: { updatedAt: { gte: startGte, lte: endLte } },
      }),
      sourcePrisma.weekendPolicy.findMany({
        where: { updatedAt: { gte: startGte, lte: endLte } },
      }),
    ]);

    // Collect all referenced user IDs to make sure target DB has required parent User records
    const userIdsSet = new Set<string>();
    workLogs.forEach((wl) => userIdsSet.add(wl.userId));
    timerStates.forEach((ts) => userIdsSet.add(ts.userId));
    notifications.forEach((n) => userIdsSet.add(n.userId));
    dayNotes.forEach((dn) => userIdsSet.add(dn.userId));
    userHolidays.forEach((uh) => userIdsSet.add(uh.userId));
    userWeekendPolicies.forEach((uwp) => userIdsSet.add(uwp.userId));

    const users = await sourcePrisma.user.findMany({
      where: {
        OR: [
          { createdAt: { gte: startGte, lte: endLte } },
          { id: { in: Array.from(userIdsSet) } },
        ],
      },
    });

    // Upsert target DB in parent -> child dependency order
    for (const u of users) {
      await targetPrisma.user.upsert({
        where: { id: u.id },
        create: u,
        update: {
          name: u.name,
          email: u.email,
          password: u.password,
          isAdmin: u.isAdmin,
          notificationsEnabled: u.notificationsEnabled,
          notifyOnCompletion: u.notifyOnCompletion,
          notifyConstant: u.notifyConstant,
          notifyInterval: u.notifyInterval,
          timeFormat: u.timeFormat,
          workHours: u.workHours,
          workMinutes: u.workMinutes,
          breakMinutes: u.breakMinutes,
          createdAt: u.createdAt,
          autoStoppedAt: u.autoStoppedAt,
          sessionVersion: u.sessionVersion,
          timezone: u.timezone,
          useServerPolicy: u.useServerPolicy,
        },
      });
    }

    for (const wp of weekendPolicies) {
      await targetPrisma.weekendPolicy.upsert({
        where: { id: wp.id },
        create: wp as any,
        update: {
          sundayOff: wp.sundayOff,
          saturdayRule: wp.saturdayRule,
          customSaturdays: wp.customSaturdays as any,
          updatedAt: wp.updatedAt,
          updatedBy: wp.updatedBy,
        },
      });
    }

    for (const uwp of userWeekendPolicies) {
      await targetPrisma.userWeekendPolicy.upsert({
        where: { id: uwp.id },
        create: uwp as any,
        update: {
          userId: uwp.userId,
          sundayOff: uwp.sundayOff,
          saturdayRule: uwp.saturdayRule,
          customSaturdays: uwp.customSaturdays as any,
          updatedAt: uwp.updatedAt,
        },
      });
    }

    for (const h of holidays) {
      await targetPrisma.holiday.upsert({
        where: { id: h.id },
        create: h,
        update: {
          name: h.name,
          date: h.date,
          durationMinutes: h.durationMinutes,
          adminId: h.adminId,
          createdAt: h.createdAt,
        },
      });
    }

    for (const uh of userHolidays) {
      await targetPrisma.userHoliday.upsert({
        where: { id: uh.id },
        create: uh,
        update: {
          userId: uh.userId,
          name: uh.name,
          date: uh.date,
          durationMinutes: uh.durationMinutes,
          createdAt: uh.createdAt,
        },
      });
    }

    for (const wl of workLogs) {
      await targetPrisma.workLog.upsert({
        where: { id: wl.id },
        create: wl,
        update: {
          userId: wl.userId,
          date: wl.date,
          punchIn: wl.punchIn,
          punchOut: wl.punchOut,
          breakMinutes: wl.breakMinutes,
          totalHours: wl.totalHours,
          status: wl.status,
          notes: wl.notes,
          createdAt: wl.createdAt,
          updatedAt: wl.updatedAt,
        },
      });
    }

    for (const ts of timerStates) {
      await targetPrisma.timerState.upsert({
        where: { id: ts.id },
        create: ts as any,
        update: {
          userId: ts.userId,
          isActive: ts.isActive,
          startTime: ts.startTime,
          targetWorkMs: ts.targetWorkMs,
          targetBreakMs: ts.targetBreakMs,
          accumulatedWorkMs: ts.accumulatedWorkMs,
          accumulatedBreakMs: ts.accumulatedBreakMs,
          lastStatusChange: ts.lastStatusChange,
          status: ts.status,
          logs: ts.logs as any,
          updatedAt: ts.updatedAt,
          hasFiredOtNotification: ts.hasFiredOtNotification,
          lastNotifiedInterval: ts.lastNotifiedInterval,
          lastUpdated: ts.lastUpdated,
          customNotifications: ts.customNotifications as any,
        },
      });
    }

    for (const n of notifications) {
      await targetPrisma.notification.upsert({
        where: { id: n.id },
        create: n,
        update: {
          userId: n.userId,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt,
        },
      });
    }

    for (const dn of dayNotes) {
      await targetPrisma.dayNote.upsert({
        where: { id: dn.id },
        create: dn,
        update: {
          userId: dn.userId,
          date: dn.date,
          note: dn.note,
          createdAt: dn.createdAt,
          updatedAt: dn.updatedAt,
        },
      });
    }

    const is24hDefault = !startDate && !endDate;

    return NextResponse.json({
      success: true,
      message: `Database migration completed (${is24hDefault ? "Last 24 hours" : "Custom range"}).`,
      direction,
      syncType: is24hDefault ? "24h" : "range",
      timeRange: {
        startDate: startGte.toISOString(),
        endDate: endLte.toISOString(),
      },
      syncedCounts: {
        users: users.length,
        holidays: holidays.length,
        weekendPolicies: weekendPolicies.length,
        userWeekendPolicies: userWeekendPolicies.length,
        userHolidays: userHolidays.length,
        workLogs: workLogs.length,
        timerStates: timerStates.length,
        notifications: notifications.length,
        dayNotes: dayNotes.length,
      },
    });
  } catch (error: any) {
    console.error("[cron/sync-db] Database sync failed:", error);
    return NextResponse.json(
      {
        error: "Synchronization failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (sourcePrisma && sourcePrisma !== prisma) {
      await sourcePrisma.$disconnect().catch(() => {});
    }
    if (targetPrisma && targetPrisma !== prisma) {
      await targetPrisma.$disconnect().catch(() => {});
    }
  }
}
