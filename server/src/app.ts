import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Config } from "./config";
import type { Sql } from "./db";
import { geminiGenerator, type ImageGenerator } from "./gemini";
import { ApiError, clientIp, enforceLimit, errorBody, type Env } from "./http";
import { log } from "./log";
import { RateLimiter } from "./ratelimit";
import { authRoutes } from "./routes/auth";
import { backupRoutes } from "./routes/backup";
import { clubRoutes } from "./routes/clubs";
import { driveRoutes } from "./routes/drives";
import { compareRoutes, friendRoutes, userRoutes } from "./routes/friends";
import { leaderboardRoutes } from "./routes/leaderboards";
import { meRoutes } from "./routes/me";
import { modImageRoute, modRoutes } from "./routes/mods";
import { blockRoutes, reportRoutes } from "./routes/safety";
import { territoryRoutes } from "./routes/territory";
import { TROPHIES, listTrophies } from "./trophies";
import { requireAuth } from "./auth";

const MB = 1024 * 1024;

function limit(maxSize: number): MiddlewareHandler<Env> {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new ApiError(413, "too_large", "Request body is too large");
    },
  });
}

export function createApp(opts: { sql: Sql; config: Config; generateImage?: ImageGenerator | null; limiter?: RateLimiter }) {
  const { sql, config } = opts;
  const generateImage =
    opts.generateImage !== undefined
      ? opts.generateImage
      : config.geminiApiKey
        ? geminiGenerator(config.geminiApiKey, config.geminiImageModel)
        : null;
  const deps = { sql, config, generateImage: config.geminiApiKey ? generateImage : null, limiter: opts.limiter ?? new RateLimiter() };

  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    const started = performance.now();
    c.set("deps", deps);
    await next();
    if (c.req.path === "/health") return;
    log("info", "request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
      ip: clientIp(c),
      user: c.var.user?.id,
    });
  });
  app.use("*", cors({ origin: config.corsOrigins, allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], maxAge: 86400 }));
  app.use("/v1/*", async (c, next) => {
    enforceLimit(c, "ip", clientIp(c));
    await next();
  });
  app.use("/v1/backup/*", limit(6 * MB));
  app.use("/v1/mods", limit(10 * MB));
  app.use("/v1/*", async (c, next) => {
    if (c.req.path.startsWith("/v1/backup/") || c.req.path === "/v1/mods") return next();
    return limit(MB)(c, next);
  });

  app.get("/health", async (c) => {
    try {
      await sql`select 1`;
      return c.json({ ok: true });
    } catch (err) {
      log("error", "health check failed", { error: String(err) });
      return c.json({ ok: false }, 503);
    }
  });

  app.get("/v1/config", (c) =>
    c.json({
      features: { aiMods: !!deps.generateImage },
      modsPerDay: config.modsPerDay,
      h3Resolution: 9,
      season: String(new Date().getUTCFullYear()),
    }),
  );
  app.get("/v1/trophies/definitions", (c) => c.json({ items: TROPHIES }));
  app.get("/v1/trophies", requireAuth, async (c) => c.json({ items: await listTrophies(sql, c.var.user.id) }));

  app.route("/v1/auth", authRoutes);
  app.route("/v1/me", meRoutes);
  app.route("/v1/drives", driveRoutes);
  app.route("/v1/backup", backupRoutes);
  app.route("/v1/users", userRoutes);
  app.route("/v1/friends", friendRoutes);
  app.route("/v1/compare", compareRoutes);
  app.route("/v1/leaderboards", leaderboardRoutes);
  app.route("/v1/territory", territoryRoutes);
  app.route("/v1/clubs", clubRoutes);
  app.route("/v1/reports", reportRoutes);
  app.route("/v1/blocks", blockRoutes);
  app.route("/v1/mods", modImageRoute);
  app.route("/v1/mods", modRoutes);

  app.notFound((c) => c.json(errorBody("not_found", "Not found"), 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(err.code, err.message), err.status);
    if (err instanceof HTTPException) return c.json(errorBody("http_error", err.message || "Request failed"), err.status);
    log("error", "unhandled error", { method: c.req.method, path: c.req.path, error: err.stack ?? String(err) });
    return c.json(errorBody("internal", "Something went wrong"), 500);
  });

  return app;
}
