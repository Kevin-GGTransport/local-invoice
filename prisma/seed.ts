import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const password = randomBytes(8).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.users.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password_hash: passwordHash,
      name: "管理员",
      role: "admin",
    },
  });
  console.log(`admin 账号已创建，初始密码：${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
