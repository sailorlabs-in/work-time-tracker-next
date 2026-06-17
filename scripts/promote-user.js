const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const updatedUser = await prisma.user.update({
    where: { email: "umangtest@example.com" },
    data: {
      isAdmin: true,
      sessionVersion: { increment: 1 }
    }
  });
  console.log("Updated User in DB:", updatedUser);
}

main()
  .catch((e) => {
    console.error("Error promoting user:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
