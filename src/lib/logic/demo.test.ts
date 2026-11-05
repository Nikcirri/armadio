import { describe, expect, it } from 'vitest';
import { DEMO_GARMENTS, buildDemoBundle, nextFriday } from './demo';
import { buildDefaultLists, buildPresetCategories } from './presets';

describe('dati di esempio', () => {
  for (const preset of ['donna', 'uomo', 'neutro'] as const) {
    it(`funziona con il preset ${preset}`, () => {
      const categories = buildPresetCategories(preset);
      const lists = buildDefaultLists();
      const photoIds = Object.fromEntries(DEMO_GARMENTS.map((g) => [g.key, `photo-${g.key}`]));
      const b = buildDemoBundle({ categories, lists, photoIds, today: '2026-11-05' });

      expect(b.items).toHaveLength(8);
      expect(b.outfits).toHaveLength(2);
      expect(b.trips).toHaveLength(1);
      expect([...b.items, ...b.outfits, ...b.trips, ...b.wearLog].every((r) => r.demo === true)).toBe(true);

      const catIds = new Set(categories.map((c) => c.id));
      for (const item of b.items) {
        expect(catIds.has(item.categoryId)).toBe(true);
        expect(categories.find((c) => c.id === item.categoryId)?.slotType).toBe(item.slotType);
        expect(item.photoIds).toHaveLength(1);
        expect(item.occasions.length).toBeGreaterThan(0);
      }
      const itemIds = new Set(b.items.map((i) => i.id));
      for (const o of b.outfits) expect(o.itemIds.every((id) => itemIds.has(id))).toBe(true);

      const trip = b.trips[0]!;
      expect(trip.startDate > '2026-11-05').toBe(true);
      expect(trip.checklist.find((c) => c.label === 'Intimo')?.qty).toBe(4);
    });
  }

  it('trova il prossimo venerdì', () => {
    expect(nextFriday('2026-11-05')).toBe('2026-11-06');
    expect(nextFriday('2026-11-06')).toBe('2026-11-06');
    expect(nextFriday('2026-11-07')).toBe('2026-11-13');
  });
});
