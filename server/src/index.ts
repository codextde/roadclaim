import { createApp } from "./app";
import { loadConfig } from "./config";
import { connect, migrate } from "./db";
import { log } from "./log";

const config = loadConfig();
const sql = connect(config.databaseUrl);
await migrate(sql);

const app = createApp({ sql, config });
const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  maxRequestBodySize: 12 * 1024 * 1024,
  idleTimeout: 120,
  fetch: (req, srv) => app.fetch(req, { server: srv }),
});
log("info", "listening", { port: server.port, aiMods: !!config.geminiApiKey });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "shutting down", { signal });
  const timer = setTimeout(() => process.exit(1), 15_000);
  await server.stop();
  await sql.close({ timeout: 5 });
  clearTimeout(timer);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
