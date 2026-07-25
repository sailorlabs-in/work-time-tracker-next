import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — Retrieve user's custom weekend policy
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const policy = await prisma.userWeekendPolicy.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json(policy);
  } catch (error) {
    console.error("GET user weekend policy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT — Upsert user's custom weekend policy
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sundayOff, saturdayRule, customSaturdays } = body;

    const policy = await prisma.userWeekendPolicy.upsert({
      where: { userId: session.user.id },
      update: {
        sundayOff: sundayOff !== undefined ? sundayOff : true,
        saturdayRule: saturdayRule || "alternate_135",
        customSaturdays: customSaturdays !== undefined ? customSaturdays : [],
      },
      create: {
        userId: session.user.id,
        sundayOff: sundayOff ?? true,
        saturdayRule: saturdayRule || "alternate_135",
        customSaturdays: customSaturdays || [],
      },
    });

    return NextResponse.json(policy);
  } catch (error) {
    console.error("PUT user weekend policy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
