import { z } from "zod";
import process from "node:process";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PREFIX: z.string().default("/api/v1"),
});

export type RawEnv = z.infer<typeof envSchema>;
export type Env = Readonly<
  RawEnv & { isProd: boolean; isDev: boolean; isTest: boolean }
>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌  Invalid environment configuration:\n",
    parsed.error.format(),
  );
  process.exit(1);
}

const data: RawEnv = parsed.data;

export const env: Env = Object.freeze({
  ...data,
  isProd: data.NODE_ENV === "production",
  isDev: data.NODE_ENV === "development",
  isTest: data.NODE_ENV === "test",
});
