import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import type { PaletteId, ThemeMode } from '../db/types';
import { paletteInfo, resolveMode, type ResolvedMode } from '../logic/theme';
import { isNative } from '../platform';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const system = $state<{ prefersDark: boolean }>({ prefersDark: media?.matches ?? false });
media?.addEventListener('change', (e) => {
  system.prefersDark = e.matches;
});

let last = '';

/** Applica palette e modalità a tutta l'app, barra di stato compresa. */
export function applyTheme(palette: PaletteId, mode: ThemeMode): ResolvedMode {
  const resolved = resolveMode(mode, system.prefersDark);
  const key = `${palette}:${resolved}`;
  if (key === last) return resolved;
  last = key;
  const root = document.documentElement;
  root.dataset.palette = palette;
  root.dataset.mode = resolved;
  const info = paletteInfo(palette);
  const barColor = resolved === 'dark' ? info.bar.dark : info.bar.light;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barColor);
  if (isNative()) {
    // Light = icone scure su sfondo chiaro; Dark = icone chiare su sfondo scuro.
    void SystemBars.setStyle({ style: resolved === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(
      () => undefined,
    );
  }
  return resolved;
}
