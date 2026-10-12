import { Hono } from "hono";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { issueToken, requireAuth } from "../auth";
import { deleteAccount } from "../clubs";
import { decrypt, encrypt, hashRecoveryKey, newRecoveryKey, randomCode } from "../crypto";
import { isUniqueViolation } from "../db";
import { ApiError, clientIp, enforceLimit, jsonBody, type Ctx, type Env } from "../http";
import { loadMe } from "../users";

export const AVATAR_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16"];

const deviceSchema = z.object({
  platform: z.enum(["ios", "android"]),
  locale: z.string().max(35).optional(),
});
const recoverySchema = z.object({ recoveryKey: z.string().min(16).max(64) });

async function findByRecovery(c: Ctx, key: string): Promise<string> {
  enforceLimit(c, "recovery", clientIp(c));
  const hash = hashRecoveryKey(key);
  const [row] = hash ? await c.var.deps.sql`select id from users where recovery_hash = ${hash}` : [];
  if (!row) throw new ApiError(404, "invalid_recovery_key", "No account matches this recovery key");
  return row.id;
}

export const authRoutes = new Hono<Env>()
  .post("/device", async (c) => {
    enforceLimit(c, "signup", clientIp(c));
    const body = await jsonBody(c, deviceSchema);
    const { sql, config } = c.var.deps;
    const recoveryKey = newRecoveryKey();
    let userId: string | null = null;
    for (let attempt = 0; attempt < 40 && !userId; attempt++) {
      const digits = attempt < 15 ? 4 : attempt < 30 ? 5 : 6;
      const number = randomInt(10 ** (digits - 1), 10 ** digits);
      try {
        const [row] = await sql`
          insert into users (username, display_name, avatar_color, invite_code, recovery_hash, recovery_enc, platform, locale)
          values (${`driver${number}`}, ${`Driver ${number}`}, ${AVATAR_COLORS[randomInt(AVATAR_COLORS.length)]!},
                  ${randomCode(8)}, ${hashRecoveryKey(recoveryKey)!}, ${encrypt(config.secretKey, recoveryKey)},
                  ${body.platform}, ${body.locale ?? null})
          returning id`;
        userId = row.id;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    if (!userId) throw new ApiError(503, "busy", "Could not allocate a username, try again");
    const token = await issueToken(sql, userId);
    return c.json({ token, recoveryKey, me: await loadMe(sql, userId) });
  })
  .post("/restore", async (c) => {
    const { recoveryKey } = await jsonBody(c, recoverySchema);
    const userId = await findByRecovery(c, recoveryKey);
    const { sql } = c.var.deps;
    return c.json({ token: await issueToken(sql, userId), me: await loadMe(sql, userId) });
  })
  .post("/delete-with-recovery", async (c) => {
    const { recoveryKey } = await jsonBody(c, recoverySchema);
    await deleteAccount(c.var.deps.sql, await findByRecovery(c, recoveryKey));
    return c.json({ ok: true });
  })
  .get("/recovery-key", requireAuth, async (c) => {
    const { sql, config } = c.var.deps;
    const [row] = await sql`select recovery_enc from users where id = ${c.var.user.id}`;
    const recoveryKey = decrypt(config.secretKey, row.recovery_enc);
    if (!recoveryKey) throw new ApiError(500, "recovery_unavailable", "The recovery key cannot be decrypted with the current SECRET_KEY");
    return c.json({ recoveryKey });
  });
