import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getWorkLogs } from "@/lib/api-services";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session || !session.user || !session.user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const eventsPromise = getWorkLogs(id, startDate, endDate);

    let notesPromise: Promise<unknown[]> = Promise.resolve([]);
    if (startDate && endDate) {
      const start = new Date(startDate.split("T")[0]);
      const end = new Date(endDate.split("T")[0]);
      notesPromise = prisma.dayNote.findMany({
        where: {
          userId: id,
          date: { gte: start, lte: end },
        },
      });
    } else {
      notesPromise = prisma.dayNote.findMany({
        where: { userId: id },
        orderBy: { date: "desc" },
      });
    }

    const [events, notes] = await Promise.all([eventsPromise, notesPromise]);

    return NextResponse.json({ events, notes });
  } catch (error) {
    console.error("Failed to fetch user logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch user logs" },
      { status: 500 },
    );
  }
}
