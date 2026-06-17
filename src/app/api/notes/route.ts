import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (date) {
      const datePart = date.split("T")[0];
      const note = await prisma.dayNote.findUnique({
        where: {
          userId_date: {
            userId: session.user.id,
            date: new Date(datePart),
          },
        },
      });
      return NextResponse.json(note);
    }

    if (startDate && endDate) {
      const start = new Date(startDate.split("T")[0]);
      const end = new Date(endDate.split("T")[0]);
      const notes = await prisma.dayNote.findMany({
        where: {
          userId: session.user.id,
          date: {
            gte: start,
            lte: end,
          },
        },
      });
      return NextResponse.json(notes);
    }

    // Default to returning all notes if no query params provided
    const notes = await prisma.dayNote.findMany({
      where: { userId: session.user.id },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("Fetch notes error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { date, note } = body;

    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const datePart = date.split("T")[0];
    const parsedDate = new Date(datePart);

    if (note === undefined || note === null || note.trim() === "") {
      // Delete the record if note is cleared
      await prisma.dayNote.deleteMany({
        where: {
          userId: session.user.id,
          date: parsedDate,
        },
      });
      return NextResponse.json({ success: true, deleted: true });
    }

    const updatedNote = await prisma.dayNote.upsert({
      where: {
        userId_date: {
          userId: session.user.id,
          date: parsedDate,
        },
      },
      update: {
        note: note.trim(),
      },
      create: {
        userId: session.user.id,
        date: parsedDate,
        note: note.trim(),
      },
    });

    return NextResponse.json({ success: true, note: updatedNote });
  } catch (error) {
    console.error("Save note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const datePart = date.split("T")[0];
    const parsedDate = new Date(datePart);

    await prisma.dayNote.deleteMany({
      where: {
        userId: session.user.id,
        date: parsedDate,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete note error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
