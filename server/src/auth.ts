import type { MiddlewareHandler } from "hono";
import { newToken, sha256 } from "./crypto";
import type { Sql } from "./db";
import { ApiError, enforceLimit, type AuthUser, type Env } from "./http";

export async function issueToken(sql: Sql, userId: string): Promise<string> {
  const token = newToken();
  await sql`insert into tokens (hash, user_id) values (${sha256(token)}, ${userId})`;
  return token;
}

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(header);
  if (!match) throw new ApiError(401, "unauthorized", "Missing or invalid token");
  const { sql } = c.var.deps;
  const tokenHash = sha256(match[1]!);
  const [user] = await sql<AuthUser[]>`
    select u.id, u.username, u.local_only, u.hide_from_leaderboards, u.cloud_backup
    from tokens t join users u on u.id = t.user_id
    where t.hash = ${tokenHash}`;
  if (!user) throw new ApiError(401, "unauthorized", "Missing or invalid token");
  c.set("user", user);
  c.set("tokenHash", tokenHash);
  enforceLimit(c, "user", user.id);
  await next();
};
