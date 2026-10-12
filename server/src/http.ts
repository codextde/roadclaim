import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Config } from "./config";
import type { Sql } from "./db";
import type { ImageGenerator } from "./gemini";
import { isInappropriate } from "./moderation";
import type { RateLimiter } from "./ratelimit";

export type AuthUser = {
  id: string;
  username: string;
  local_only: boolean;
  hide_from_leaderboards: boolean;
  cloud_backup: boolean;
};

export type Deps = {
  sql: Sql;
  config: Config;
  generateImage: ImageGenerator | null;
  limiter: RateLimiter;
  boardCache: Map<string, { expires: number; value: unknown }>;
};

export type Env = { Variables: { user: AuthUser; tokenHash: string; deps: Deps } };
export type Ctx = Context<Env>;

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const forbidden = (code: string, message: string) => new ApiError(403, code, message);
export const badRequest = (message: string, code = "invalid_request") => new ApiError(400, code, message);

export function assertClean(...texts: (string | null | undefined)[]): void {
  if (texts.some((t) => t && isInappropriate(t))) {
    throw new ApiError(422, "inappropriate_name", "Please choose a different name, this one is not allowed");
  }
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw badRequest(`${path}${issue?.message ?? "Invalid input"}`);
  }
  return r.data;
}

export async function jsonBody<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  return parse(schema, data);
}

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected a hex colour like #10B981");

export function idParam(c: Ctx, name = "id"): string {
  const v = c.req.param(name);
  if (!v || !uuid.safeParse(v).success) throw notFound();
  return v.toLowerCase();
}

export function clientIp(c: Ctx): string {
  const { config } = c.var.deps;
  if (config.trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
    const real = c.req.header("x-real-ip");
    if (real) return real.trim();
  }
  const server = (c.env as { server?: { requestIP(r: Request): { address: string } | null } } | undefined)?.server;
  return server?.requestIP(c.req.raw)?.address ?? "unknown";
}

export function ipRateKey(ip: string): string {
  const addr = ip.split("%")[0]!.toLowerCase();
  if (!addr.includes(":")) return addr;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return mapped[1]!;
  const [head = "", tail] = addr.split("::");
  const left = head.split(":").filter(Boolean);
  const right = tail === undefined ? [] : tail.split(":").filter(Boolean);
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":")}::/64`;
}

export function publicOrigin(c: Ctx): string {
  const configured = c.var.deps.config.publicUrl;
  if (configured) return configured;
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || url.host;
  return `${proto}://${host}`;
}

export function enforceLimit(c: Ctx, rule: Parameters<RateLimiter["hit"]>[0], key: string): void {
  const r = c.var.deps.limiter.hit(rule, key);
  if (!r.ok) {
    c.header("Retry-After", String(r.retryAfterS));
    throw new ApiError(429, "rate_limited", "Too many requests, try again later");
  }
}
