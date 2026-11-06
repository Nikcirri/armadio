import { describe, expect, it } from 'vitest';
import { ALL_CATEGORY_ICONS, CATEGORY_ICON_GROUPS, defaultIconFor, iconGroupsFor, iconLabel } from './categoryIcons';
import { PRESETS, buildPresetCategories } from './presets';
import { SLOTS } from './slots';

describe('icone delle categorie', () => {
  it('tante icone, senza doppioni, ognuna con la sua etichetta', () => {
    expect(ALL_CATEGORY_ICONS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ALL_CATEGORY_ICONS.map((i) => i.emoji)).size).toBe(ALL_CATEGORY_ICONS.length);
    for (const i of ALL_CATEGORY_ICONS) expect(i.label.trim().length, i.emoji).toBeGreaterThan(0);
    expect(iconLabel('👙')).toBe('Reggiseni');
    expect(iconLabel('🦄')).toBeNull();
  });

  it('ci sono tutte le icone delle categorie dei preset', () => {
    const emojis = new Set(ALL_CATEGORY_ICONS.map((i) => i.emoji));
    for (const p of PRESETS) for (const c of buildPresetCategories(p.id)) expect(emojis.has(c.icon), `${p.id} ${c.name} ${c.icon}`).toBe(true);
  });

  it('mette in cima il gruppo del tipo di capo e propone la sua icona tipica', () => {
    expect(iconGroupsFor('underwear')[0]!.id).toBe('underwear');
    expect(iconGroupsFor('shoes')[0]!.id).toBe('shoes');
    expect(iconGroupsFor('top_base').map((g) => g.id)).toEqual(CATEGORY_ICON_GROUPS.map((g) => g.id));
    expect(iconGroupsFor('shoes')).toHaveLength(CATEGORY_ICON_GROUPS.length);
    for (const s of SLOTS) {
      const icon = defaultIconFor(s.id);
      expect(iconGroupsFor(s.id)[0]!.icons.some((i) => i.emoji === icon), s.id).toBe(true);
    }
  });
});
