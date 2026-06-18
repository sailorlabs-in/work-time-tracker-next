import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { prisma } from "@/lib/db";

/**
 * POST /api/cron/sync-db
 * Called at 12:00 AM daily by an external cron scheduler.
 * Syncs all records from the primary database (DB 1) to the backup database (DB 2).
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

  const backupUrl = process.env.DATABASE_URL_BACKUP;
  if (!backupUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL_BACKUP environment variable is not defined" },
      { status: 500 }
    );
  }

  let prisma2: PrismaClient | null = null;
  try {
    // 2. Fetch all data from primary DB (DB 1)
    const users = await prisma.user.findMany();
    const holidays = await prisma.holiday.findMany();
    const workLogs = await prisma.workLog.findMany();
    const timerStates = await prisma.timerState.findMany();
    const notifications = await prisma.notification.findMany();

    // 3. Connect to backup DB (DB 2)
    // Prisma 7 removed datasources/datasourceUrl from PrismaClient constructor.
    // Use the pg driver adapter to pass a dynamic connection URL.
    const adapter = new PrismaPg({ connectionString: backupUrl });
    prisma2 = new PrismaClient({ adapter });

    // 4. Run sync transaction on backup DB (DB 2)
    // Clear and insert inside a transaction to ensure atomic rollback on failure.
    await prisma2.$transaction([
      // Clear existing records in dependency-safe order (children first)
      prisma2.timerState.deleteMany(),
      prisma2.workLog.deleteMany(),
      prisma2.notification.deleteMany(),
      prisma2.user.deleteMany(),
      prisma2.holiday.deleteMany(),

      // Insert new records in dependency-safe order (parents first)
      prisma2.user.createMany({ data: users }),
      prisma2.holiday.createMany({ data: holidays }),
      prisma2.workLog.createMany({ data: workLogs }),
      prisma2.timerState.createMany({ data: timerStates as any[] }),
      prisma2.notification.createMany({ data: notifications }),
    ]);

    console.log(
      `[cron/sync-db] Daily DB sync completed successfully. Synced ${users.length} users, ${holidays.length} holidays, ${workLogs.length} work logs.`
    );

    return NextResponse.json({
      success: true,
      message: "Database synchronization completed successfully.",
      syncedCounts: {
        users: users.length,
        holidays: holidays.length,
        workLogs: workLogs.length,
        timerStates: timerStates.length,
        notifications: notifications.length,
      },
    });
  } catch (error: any) {
    console.error("[cron/sync-db] Daily DB sync failed:", error);
    return NextResponse.json(
      {
        error: "Synchronization failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (prisma2) {
      await prisma2.$disconnect();
    }
  }
}
