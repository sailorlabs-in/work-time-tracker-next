const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      sessionVersion: true
    }
  });
  console.log("Users in Database:");
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch((e) => {
    console.error("Error checking database:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
