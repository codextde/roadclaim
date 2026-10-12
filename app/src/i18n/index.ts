import { getLocales } from 'expo-localization';

import { de } from './de';
import { en } from './en';
import type { Dict, Key, Lang } from './types';

export type { Key, Lang };

const dicts: Record<Lang, Dict> = { en, de };

export function systemLang(): Lang {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return code === 'de' ? 'de' : 'en';
}

const lang = systemLang();

function lookup(dict: Dict, key: string): string | null {
  let node: unknown = dict;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : null;
}

export type Vars = Record<string, string | number>;

export function translate(l: Lang, key: Key, vars?: Vars) {
  let text = lookup(dicts[l], key) ?? lookup(en as Dict, key) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

export function t(key: Key, vars?: Vars) {
  return translate(lang, key, vars);
}

export function plural(key: Key, n: number, vars?: Vars) {
  const one = `${key}_one` as Key;
  const k = n === 1 && lookup(dicts[lang], one) != null ? one : key;
  return translate(lang, k, { n: formatInt(n), ...vars });
}

export function locale() {
  return lang === 'de' ? 'de-DE' : 'en-US';
}

export function formatInt(n: number) {
  return Math.round(n).toLocaleString(locale());
}

export function useT() {
  return { t, plural, lang, locale: locale() };
}
