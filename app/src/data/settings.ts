import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Units } from '@/core/format';

export type GarageCar = {
  id: string;
  catalogId: string;
  make: string;
  model: string;
  year?: number;
  color: string;
  nickname?: string;
  photoUri?: string;
};

export type CardStyle = 'dark' | 'light' | 'minimal';
export type ThemePref = 'system' | 'dark' | 'light';

export type SettingsValues = {
  units: Units;
  autoDetect: boolean;
  stopAfterMin: number;
  theme: ThemePref;
  cardStyle: CardStyle;
  onboarded: boolean;
  activeCarId: string | null;
  cars: GarageCar[];
  localOnly: boolean;
  lastRecapMonth: string | null;
};

type SettingsState = SettingsValues & {
  set: (patch: Partial<SettingsValues>) => void;
};

const defaultUnits = (): Units => {
  const system = getLocales()[0]?.measurementSystem;
  return system === 'us' || system === 'uk' ? 'imperial' : 'metric';
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      units: defaultUnits(),
      autoDetect: true,
      stopAfterMin: 4,
      theme: 'system',
      cardStyle: 'dark',
      onboarded: false,
      activeCarId: null,
      cars: [],
      localOnly: false,
      lastRecapMonth: null,
      set: (patch) =>
        set(patch.stopAfterMin == null ? patch : { ...patch, stopAfterMin: Math.min(10, Math.max(2, Math.round(patch.stopAfterMin))) }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (key: string) => Storage.getItemSync(key),
        setItem: (key: string, value: string) => Storage.setItemSync(key, value),
        removeItem: (key: string) => {
          Storage.removeItemSync(key);
        },
      })),
    },
  ),
);

export const settings = () => useSettings.getState();
