import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { resetBackups } from '@/data/drives';
import { settings, useSettings } from '@/data/settings';

import { ApiError, isNetworkError, migrateKeychain, readSecure, readToken, SECURE_OPTIONS, setToken, TOKEN_STORAGE_KEY, writeSecure } from './client';
import { api } from './endpoints';
import type { Me, MePatch, Privacy } from './types';

const RECOVERY_KEY = 'roadclaim.recoveryKey';
const ME_CACHE = 'roadclaim.me';
const PENDING_PRIVACY = 'roadclaim.pendingPrivacy';

type SessionState = { me: Me | null; ready: boolean; offline: boolean };

function cachedMe(): Me | null {
  try {
    const raw = Storage.getItemSync(ME_CACHE);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

const useSessionStore = create<SessionState>(() => ({ me: cachedMe(), ready: false, offline: false }));

function setMe(me: Me | null) {
  const before = useSessionStore.getState().me;
  if (me && before && before.id === me.id && before.privacy.cloudBackup !== me.privacy.cloudBackup) resetBackups();
  useSessionStore.setState({ me });
  if (me) Storage.setItemSync(ME_CACHE, JSON.stringify(me));
  else Storage.removeItemSync(ME_CACHE);
}

export const currentMe = () => useSessionStore.getState().me;

class KeychainUnavailable extends Error {}

async function restoreWith(key: string) {
  const res = await api.restore(key);
  setToken(res.token);
  setMe(res.me);
}

async function signUp() {
  const recovery = readSecure(RECOVERY_KEY);
  if (!recovery.ok) throw new KeychainUnavailable();
  if (recovery.value) {
    await restoreWith(recovery.value);
    return;
  }
  const res = await api.deviceSignup({ platform: Platform.OS === 'ios' ? 'ios' : 'android', locale: getLocales()[0]?.languageTag });
  setToken(res.token);
  writeSecure(RECOVERY_KEY, res.recoveryKey);
  setMe(res.me);
}

function pendingPrivacy(): Partial<Privacy> | null {
  try {
    const raw = Storage.getItemSync(PENDING_PRIVACY);
    return raw ? (JSON.parse(raw) as Partial<Privacy>) : null;
  } catch {
    return null;
  }
}

/** Sends a privacy change that was made offline. Safe to call any time. */
export async function flushPendingPrivacy() {
  const patch = pendingPrivacy();
  const token = readToken();
  if (!patch || !token.ok || !token.value) return;
  try {
    setMe(await api.updateMe({ privacy: patch }));
    Storage.removeItemSync(PENDING_PRIVACY);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) Storage.removeItemSync(PENDING_PRIVACY);
  }
}

async function load() {
  if (AppState.currentState === 'active') await migrateKeychain([TOKEN_STORAGE_KEY, RECOVERY_KEY]).catch(() => undefined);
  await flushPendingPrivacy();
  if (settings().localOnly) {
    useSessionStore.setState({ ready: true, offline: false });
    return;
  }
  try {
    const token = readToken();
    if (!token.ok) throw new KeychainUnavailable();
    if (!token.value) {
      await signUp();
    } else {
      try {
        setMe(await api.me());
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) throw e;
        const recovery = readSecure(RECOVERY_KEY);
        if (!recovery.ok) throw new KeychainUnavailable();
        if (recovery.value) await restoreWith(recovery.value);
        else {
          setToken(null);
          await signUp();
        }
      }
    }
    useSessionStore.setState({ offline: false });
  } catch (e) {
    const retryLater = e instanceof KeychainUnavailable || isNetworkError(e) || (e instanceof ApiError && (e.status >= 500 || e.status === 429));
    useSessionStore.setState({ offline: retryLater });
  } finally {
    useSessionStore.setState({ ready: true });
  }
}

let loading: Promise<void> | null = null;

export function refreshSession(): Promise<void> {
  if (!loading) {
    loading = load().finally(() => {
      loading = null;
    });
  }
  return loading;
}

let booted = false;

function boot() {
  if (booted) return;
  booted = true;
  refreshSession();
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && (useSessionStore.getState().offline || !useSessionStore.getState().me || pendingPrivacy())) refreshSession();
  });
}

export function useSession(): { me: Me | null; ready: boolean; offline: boolean; refresh(): Promise<void> } {
  const state = useSessionStore();
  useEffect(boot, []);
  return { me: state.me, ready: state.ready, offline: state.offline, refresh: refreshSession };
}

export async function updateMe(patch: MePatch): Promise<Me> {
  const me = await api.updateMe(patch);
  setMe(me);
  return me;
}

export async function getRecoveryKey(): Promise<string | null> {
  const local = readSecure(RECOVERY_KEY);
  if (local.ok && local.value) return local.value;
  const token = readToken();
  if (!token.ok || !token.value) return null;
  const { recoveryKey } = await api.recoveryKey();
  if (local.ok) writeSecure(RECOVERY_KEY, recoveryKey);
  return recoveryKey;
}

export async function restoreAccount(recoveryKey: string): Promise<Me> {
  const key = recoveryKey.trim();
  const res = await api.restore(key);
  setToken(res.token);
  writeSecure(RECOVERY_KEY, key);
  setMe(res.me);
  useSettings.getState().set({ localOnly: res.me.privacy.localOnly });
  return res.me;
}

export async function deleteAccount(): Promise<void> {
  const token = readToken();
  if (token.ok && token.value) await api.deleteMe();
  setToken(null);
  await SecureStore.deleteItemAsync(RECOVERY_KEY, SECURE_OPTIONS).catch(() => undefined);
  Storage.removeItemSync(PENDING_PRIVACY);
  setMe(null);
}

export async function setLocalOnly(on: boolean): Promise<void> {
  useSettings.getState().set({ localOnly: on });
  Storage.setItemSync(PENDING_PRIVACY, JSON.stringify({ ...pendingPrivacy(), localOnly: on }));
  await flushPendingPrivacy();
  if (!on) await refreshSession();
}
