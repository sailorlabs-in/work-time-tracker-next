import { defineConfig } from "prisma/config";
import * as fs from "fs";
import * as path from "path";

// Manually load env files in correct precedence (.env.local overrides .env)
const loadEnv = (file: string) => {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const envContent = fs.readFileSync(filePath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
};

loadEnv(".env.local");
loadEnv(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/worktracker?schema=public",
  },
});
