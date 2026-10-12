export type Config = {
  databaseUrl: string;
  port: number;
  secretKey: string;
  geminiApiKey: string | null;
  geminiImageModel: string;
  modsPerDay: number;
  modsGlobalPerDay: number;
  publicUrl: string | null;
  corsOrigins: string[];
  trustProxy: boolean;
};

function normalizeUrl(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return (/^https?:\/\//.test(v) ? v : `https://${v}`).replace(/\/+$/, "");
}

function intEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const secretKey = env.SECRET_KEY;
  if (!secretKey || secretKey.length < 16) throw new Error("SECRET_KEY is required (at least 16 characters)");
  return {
    databaseUrl,
    port: Number(env.PORT) || 8080,
    secretKey,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    geminiImageModel: env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image",
    modsPerDay: intEnv(env.MODS_PER_DAY, 3),
    modsGlobalPerDay: intEnv(env.MODS_GLOBAL_PER_DAY, 100),
    publicUrl: normalizeUrl(env.PUBLIC_URL),
    corsOrigins: (env.CORS_ORIGINS ?? "https://roadclaim.codext.de")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY !== "0" && env.TRUST_PROXY !== "false",
  };
}
