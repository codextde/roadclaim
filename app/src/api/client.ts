import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://roadclaim-api.codext.de').replace(/\/$/, '');

const TOKEN_KEY = 'roadclaim.token';
const MIGRATED_KEY = 'roadclaim.keychainMigrated';

export const SECURE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export type SecureRead = { ok: true; value: string | null } | { ok: false };

export function readSecure(key: string): SecureRead {
  try {
    return { ok: true, value: SecureStore.getItem(key, SECURE_OPTIONS) };
  } catch {
    return { ok: false };
  }
}

export function writeSecure(key: string, value: string) {
  SecureStore.setItem(key, value, SECURE_OPTIONS);
}

/** Re-saves keychain items written before AFTER_FIRST_UNLOCK so background launches can read them. Foreground only. */
export async function migrateKeychain(keys: string[]) {
  if (Storage.getItemSync(MIGRATED_KEY) === '1') return;
  for (const key of keys) {
    const read = readSecure(key);
    if (!read.ok) return;
    if (read.value == null) continue;
    await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
    writeSecure(key, read.value);
  }
  Storage.setItemSync(MIGRATED_KEY, '1');
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterS: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

let token: string | null | undefined;

/** The stored token; `{ ok: false }` when the keychain could not be read (e.g. before first unlock). */
export function readToken(): SecureRead {
  if (token !== undefined) return { ok: true, value: token };
  const read = readSecure(TOKEN_KEY);
  if (read.ok) token = read.value;
  return read;
}

export function getToken(): string | null {
  const read = readToken();
  return read.ok ? read.value : null;
}

export function setToken(next: string | null) {
  token = next;
  if (next) writeSecure(TOKEN_KEY, next);
  else SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_OPTIONS).catch(() => undefined);
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  auth?: boolean;
  retries?: number;
  timeoutMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function url(path: string, query?: RequestOptions['query']) {
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return `${API_URL}${path}${params.length ? `?${params.join('&')}` : ''}`;
}

async function once<T>(path: string, o: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const t = o.auth === false ? null : getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body: string | FormData | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(url(path, o.query), { method: o.method ?? 'GET', headers, body, signal: controller.signal });
  } catch (e) {
    throw new ApiError(0, 'network', e instanceof Error ? e.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => '');
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    const retryAfter = Number(res.headers.get('Retry-After'));
    throw new ApiError(
      res.status,
      err?.code ?? `http_${res.status}`,
      err?.message ?? res.statusText ?? 'Request failed',
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }
  return json as T;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const retries = options.retries ?? (method === 'GET' ? 2 : 0);
  for (let attempt = 0; ; attempt++) {
    try {
      return await once<T>(path, options);
    } catch (e) {
      const retryable = e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 408 || e.code === 'rate_limited');
      if (!retryable || attempt >= retries) throw e;
      await sleep(Math.min(8000, (e instanceof ApiError && e.retryAfterS ? e.retryAfterS * 1000 : 600 * 2 ** attempt)) + Math.random() * 300);
    }
  }
}
