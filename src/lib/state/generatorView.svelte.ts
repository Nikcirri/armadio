import type { SlotType } from '../db/types';
import { defaultGeneratorOptions, type GeneratorOptions, type Locks, type Look } from '../logic/generator';
import { selectTab } from './nav.svelte';

/** "Cosa metto?": opzioni, look attuale e lucchetti restano finché l'app è aperta. */
export const generatorView = $state<{
  options: GeneratorOptions;
  look: Look | null;
  reasons: string[];
  locks: Locks;
  relaxed: boolean;
  problems: string[];
  /** Correzioni che darebbero un abbinamento, quando non ce n'è nessuno. */
  fixes: { label: string; patch: Partial<GeneratorOptions> }[];
  /** Outfit salvato da questo look (per "Indossa subito"). */
  savedOutfitId: string | null;
}>({
  options: defaultGeneratorOptions(),
  look: null,
  reasons: [],
  locks: {},
  relaxed: false,
  problems: [],
  fixes: [],
  savedOutfitId: null,
});

/** "Abbinalo ora" (Statistiche): apre "Cosa metto?" con il capo bloccato nel suo slot. */
export function matchItemNow(slot: SlotType, itemId: string): void {
  generatorView.locks = { [slot]: itemId };
  generatorView.look = null;
  generatorView.reasons = [];
  generatorView.problems = [];
  generatorView.fixes = [];
  generatorView.relaxed = false;
  generatorView.savedOutfitId = null;
  selectTab('cosa-metto');
}
