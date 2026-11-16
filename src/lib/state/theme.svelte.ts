import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import type { FontId, PaletteId, ThemeMode } from '../db/types';
import { fontInfo, paletteInfo, resolveMode, type ResolvedMode } from '../logic/theme';
import { isNative } from '../platform';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const system = $state<{ prefersDark: boolean }>({ prefersDark: media?.matches ?? false });
media?.addEventListener('change', (e) => {
  system.prefersDark = e.matches;
});

let last = '';

/** Applica palette, caratteri e modalità a tutta l'app, barre di sistema comprese (SPEC.md, sezione 7). */
export function applyTheme(palette: PaletteId, mode: ThemeMode, font?: FontId): ResolvedMode {
  const resolved = resolveMode(mode, system.prefersDark);
  const info = paletteInfo(palette);
  const fontId = fontInfo(font).id;
  const key = `${info.id}:${resolved}:${fontId}`;
  if (key === last) return resolved;
  last = key;
  const root = document.documentElement;
  root.dataset.palette = info.id;
  root.dataset.mode = resolved;
  root.dataset.font = fontId;
  const barColor = resolved === 'dark' ? info.bar.dark : info.bar.light;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barColor);
  if (isNative()) {
    // Light = icone scure su sfondo chiaro; Dark = icone chiare su sfondo scuro.
    // In alto lo sfondo segue il tema; in basso la barra delle sezioni è sempre scura.
    void SystemBars.setStyle({
      style: resolved === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      bar: SystemBarType.StatusBar,
    }).catch(() => undefined);
    void SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.NavigationBar }).catch(() => undefined);
  }
  return resolved;
}
