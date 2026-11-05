import { liveQuery } from 'dexie';
import { db } from '../db';
import { getAllSettings } from '../db/repo';
import type { SettingsMap } from '../db/types';

/** Impostazioni sempre aggiornate (si ricaricano da sole quando cambiano nel database). */
export const settings = $state<{ loaded: boolean; value: Partial<SettingsMap> }>({
  loaded: false,
  value: {},
});

let started = false;

export function startSettings(onError: (e: unknown) => void): void {
  if (started) return;
  started = true;
  liveQuery(() => getAllSettings(db)).subscribe({
    next: (value) => {
      settings.value = value;
      settings.loaded = true;
    },
    error: onError,
  });
}
