import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CROCKFORD[randomInt(32)];
  return out;
}

export function newRecoveryKey(): string {
  const raw = randomCode(16);
  return `RC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeRecoveryKey(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.startsWith("RC") && s.length === 18) s = s.slice(2);
  s = s.replace(/[IL]/g, "1").replace(/O/g, "0");
  if (s.length !== 16 || ![...s].every((ch) => CROCKFORD.includes(ch))) return null;
  return s;
}

export function hashRecoveryKey(key: string): string | null {
  const n = normalizeRecoveryKey(key);
  return n ? sha256(`recovery:${n}`) : null;
}

function deriveKey(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

export function encrypt(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, "enc"), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function decrypt(secret: string, payload: string): string | null {
  try {
    const buf = Buffer.from(payload, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, "enc"), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function sign(secret: string, value: string): string {
  return createHmac("sha256", deriveKey(secret, "sig")).update(value).digest("base64url").slice(0, 32);
}

export function verifySignature(secret: string, value: string, sig: string): boolean {
  const expected = Buffer.from(sign(secret, value));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
