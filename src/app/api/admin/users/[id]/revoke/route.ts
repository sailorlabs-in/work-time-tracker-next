import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session || !session.user || !session.user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent users from revoking their own admin rights
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Cannot revoke your own admin rights" },
      { status: 400 },
    );
  }

  try {
    const userToUpdate = await prisma.user.findUnique({ where: { id } });

    if (!userToUpdate) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { 
        isAdmin: false,
        sessionVersion: { increment: 1 },
      },
      select: { id: true, name: true, email: true, isAdmin: true },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Failed to revoke admin rights:", error);
    return NextResponse.json(
      { error: "Failed to revoke admin rights" },
      { status: 500 },
    );
  }
}
