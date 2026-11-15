import { describe, expect, it } from 'vitest';
import type { ItemRecord, OutfitRecord, PlannerRecord, SlotType, WearLogRecord } from '../db/types';
import { createItem, createOutfit } from './factories';
import { SHORTCUT_URLS, parseShortcutUrl, widgetDays, widgetSignature, type WidgetInput } from './widget';

const NOW = '2026-11-15T10:00:00.000Z';
const TODAY = '2026-11-15';

const item = (id: string, slot: SlotType, name = id): ItemRecord =>
  createItem({ name, id }, { id: `c-${slot}`, slotType: slot, defaultMaxWears: 2 }, NOW);
const plan = (date: string, over: Partial<PlannerRecord> = {}): PlannerRecord => ({
  date,
  outfitId: null,
  itemIds: [],
  note: '',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const wear = (date: string, itemIds: string[], outfitId: string | null = null): WearLogRecord => ({
  id: `w-${date}-${itemIds.join()}`,
  date,
  itemIds,
  itemNames: itemIds,
  outfitId,
  diaryId: null,
  createdAt: NOW,
  updatedAt: NOW,
});

const ITEMS = [
  item('jeans', 'bottom', 'Jeans blu'),
  item('tee', 'top_base', 'Maglietta bianca'),
  item('coat', 'outerwear', 'Cappotto'),
  item('sneakers', 'shoes', 'Sneakers'),
  item('bag', 'accessory', 'Borsa'),
  item('bra', 'underwear', 'Reggiseno'),
  item('sweater', 'top_layer', 'Maglione'),
];
const byId = new Map(ITEMS.map((i) => [i.id, i]));
const office: OutfitRecord = createOutfit({ id: 'o1', name: 'Ufficio', itemIds: ['sneakers', 'jeans', 'bra', 'tee'] }, NOW);
const outfits = new Map([[office.id, office]]);

const input = (over: Partial<WidgetInput> = {}): WidgetInput => ({ today: TODAY, wear: [], planner: [], outfits, items: byId, ...over });

describe('parseShortcutUrl', () => {
  it('riconosce gli indirizzi di scorciatoie e widget, e nient’altro', () => {
    expect(parseShortcutUrl('armadio://cosa-metto')).toBe('cosa-metto');
    expect(parseShortcutUrl(' ARMADIO://Aggiungi-Capo/ ')).toBe('add-item');
    expect(parseShortcutUrl(SHORTCUT_URLS['end-of-day'])).toBe('end-of-day');
    expect(parseShortcutUrl('armadio://agenda')).toBe('agenda');
    expect(parseShortcutUrl('armadio://svuota-tutto')).toBeNull();
    expect(parseShortcutUrl('https://example.com/cosa-metto')).toBeNull();
    expect(parseShortcutUrl('')).toBeNull();
  });
});

describe('widgetDays', () => {
  it('senza agenda né capi indossati non c’è niente', () => {
    expect(widgetDays(input())).toEqual([]);
  });

  it('mostra l’outfit in agenda nell’ordine del collage, senza intimo', () => {
    const [d] = widgetDays(input({ planner: [plan(TODAY, { outfitId: 'o1' })] }));
    expect(d).toEqual({
      date: TODAY,
      kind: 'planned',
      label: 'In agenda: Ufficio',
      itemIds: ['tee', 'jeans', 'sneakers'],
      names: ['Maglietta bianca', 'Jeans blu', 'Sneakers'],
      more: 0,
    });
  });

  it('quello indossato oggi vince sull’agenda', () => {
    const days = widgetDays(input({ planner: [plan(TODAY, { itemIds: ['coat'] })], wear: [wear(TODAY, ['tee', 'jeans'], 'o1')] }));
    expect(days[0]).toMatchObject({ kind: 'worn', label: 'Indossato oggi: Ufficio', itemIds: ['tee', 'jeans'] });
    const loose = widgetDays(input({ wear: [wear(TODAY, ['tee']), wear(TODAY, ['coat'], 'o1')] }));
    expect(loose[0]).toMatchObject({ label: 'Indossato oggi', itemIds: ['coat', 'tee'] });
  });

  it('ignora lo storico degli altri giorni', () => {
    expect(widgetDays(input({ wear: [wear('2026-11-14', ['tee'])] }))).toEqual([]);
  });

  it('al massimo 4 miniature, il resto in “+N”', () => {
    const [d] = widgetDays(input({ planner: [plan(TODAY, { itemIds: ['bag', 'sneakers', 'jeans', 'tee', 'sweater', 'coat', 'bra'] })] }));
    expect(d!.label).toBe('In agenda: capi scelti');
    expect(d!.itemIds).toEqual(['coat', 'sweater', 'tee', 'jeans']);
    expect(d!.more).toBe(2);
  });

  it('prende oggi e i 7 giorni seguenti, compresa una nota senza capi', () => {
    const days = widgetDays(
      input({
        planner: [
          plan('2026-11-14', { itemIds: ['tee'] }),
          plan('2026-11-16', { note: '  Cena dai nonni ' }),
          plan('2026-11-22', { outfitId: 'o1' }),
          plan('2026-11-23', { outfitId: 'o1' }),
          plan('2026-11-18', { note: '   ' }),
        ],
      }),
    );
    expect(days.map((d) => [d.date, d.label])).toEqual([
      ['2026-11-16', 'In agenda: Cena dai nonni'],
      ['2026-11-22', 'In agenda: Ufficio'],
    ]);
  });

  it('capi ed outfit eliminati non compaiono; un outfit senza nome si chiama “Outfit”', () => {
    const noName = createOutfit({ id: 'o2', name: ' ', itemIds: ['gone', 'tee', 'tee'] }, NOW);
    const days = widgetDays(
      input({
        outfits: new Map([[noName.id, noName]]),
        planner: [plan(TODAY, { outfitId: 'o2' }), plan('2026-11-16', { outfitId: 'missing', itemIds: ['gone'] })],
      }),
    );
    expect(days).toEqual([{ date: TODAY, kind: 'planned', label: 'In agenda: Outfit', itemIds: ['tee'], names: ['Maglietta bianca'], more: 0 }]);
  });
});

describe('widgetSignature', () => {
  it('cambia se cambiano i giorni o la foto di un capo mostrato', () => {
    const days = widgetDays(input({ planner: [plan(TODAY, { outfitId: 'o1' })] }));
    const stamps = new Map([
      ['tee', 'p1@1'],
      ['coat', 'p9@1'],
    ]);
    const a = widgetSignature(days, stamps);
    expect(widgetSignature(days, new Map(stamps))).toBe(a);
    expect(widgetSignature(days, new Map([...stamps, ['coat', 'p9@2']]))).toBe(a);
    expect(widgetSignature(days, new Map([...stamps, ['tee', 'p1@2']]))).not.toBe(a);
    expect(widgetSignature([], stamps)).not.toBe(a);
  });
});
