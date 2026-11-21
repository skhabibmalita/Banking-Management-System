import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CLIENT_URL: z.string().min(1).default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  console.error("Copy server/.env.example to server/.env and fill in the values.");
  process.exit(1);
}

const e = parsed.data;
const isProd = e.NODE_ENV === "production";

if (isProd && (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET)) {
  console.error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.");
  process.exit(1);
}

export const env = {
  ...e,
  isProd,
  isTest: e.NODE_ENV === "test",
  clientOrigins: e.CLIENT_URL.split(",").map((s) => s.trim()).filter(Boolean),
  cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === "true" : isProd,
};
