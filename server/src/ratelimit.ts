type Bucket = { count: number; resetAt: number };

export type RateRule = { limit: number; windowMs: number };

export const RATE_RULES = {
  signup: { limit: 20, windowMs: 60 * 60_000 },
  recovery: { limit: 30, windowMs: 60 * 60_000 },
  upload: { limit: 120, windowMs: 60 * 60_000 },
  backup: { limit: 600, windowMs: 60 * 60_000 },
  ip: { limit: 600, windowMs: 60_000 },
  user: { limit: 300, windowMs: 60_000 },
} satisfies Record<string, RateRule>;

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(private rules: Record<keyof typeof RATE_RULES, RateRule> = RATE_RULES) {}

  hit(rule: keyof typeof RATE_RULES, key: string, now = Date.now()): { ok: boolean; retryAfterS: number } {
    const { limit, windowMs } = this.rules[rule];
    this.sweep(now);
    const id = `${rule}:${key}`;
    let b = this.buckets.get(id);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(id, b);
    }
    b.count++;
    return { ok: b.count <= limit, retryAfterS: Math.ceil((b.resetAt - now) / 1000) };
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
