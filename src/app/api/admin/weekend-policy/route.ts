import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — Retrieve the global weekend policy
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get or create default policy
    let policy = await prisma.weekendPolicy.findFirst();
    if (!policy) {
      policy = await prisma.weekendPolicy.create({
        data: {
          sundayOff: true,
          saturdayRule: "alternate_135",
          customSaturdays: [],
        },
      });
    }

    return NextResponse.json(policy);
  } catch (error) {
    console.error("GET weekend policy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT — Admin updates the global weekend policy
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { sundayOff, saturdayRule, customSaturdays } = body;

    // Get existing policy or create new one
    let existing = await prisma.weekendPolicy.findFirst();

    if (existing) {
      const updated = await prisma.weekendPolicy.update({
        where: { id: existing.id },
        data: {
          sundayOff: sundayOff !== undefined ? sundayOff : existing.sundayOff,
          saturdayRule: saturdayRule || existing.saturdayRule,
          customSaturdays: customSaturdays !== undefined ? customSaturdays : existing.customSaturdays,
          updatedBy: session.user.id,
        },
      });
      return NextResponse.json(updated);
    } else {
      const created = await prisma.weekendPolicy.create({
        data: {
          sundayOff: sundayOff ?? true,
          saturdayRule: saturdayRule || "alternate_135",
          customSaturdays: customSaturdays || [],
          updatedBy: session.user.id,
        },
      });
      return NextResponse.json(created);
    }
  } catch (error) {
    console.error("PUT weekend policy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
