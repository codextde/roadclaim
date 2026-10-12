type Level = "debug" | "info" | "warn" | "error";

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (process.env.LOG_LEVEL === "silent") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
