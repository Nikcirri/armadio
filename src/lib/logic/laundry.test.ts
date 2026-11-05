import { describe, expect, it } from 'vitest';
import type { ItemRecord } from '../db/types';
import { createItem } from './factories';
import {
  buildLoads,
  colorGroupOf,
  hasBleedRisk,
  laundryOverview,
  loadTitle,
  programOf,
  returnCandidates,
  storeCandidates,
  suggestedSeasonToStore,
} from './laundry';

const cat = { id: 'c', slotType: 'top_base' as const, defaultMaxWears: 1 };
const item = (over: Partial<ItemRecord>) => createItem({ name: 'Capo', status: 'toWash', ...over }, cat);

describe('programmi di lavaggio', () => {
  it('sceglie il più delicato tra le etichette', () => {
    expect(programOf({ washTags: [] })).toBe('wash30');
    expect(programOf({ washTags: ['max40'] })).toBe('wash40');
    expect(programOf({ washTags: ['max40', 'max30'] })).toBe('wash30');
    expect(programOf({ washTags: ['max30', 'noSpin'] })).toBe('delicate');
    expect(programOf({ washTags: ['delicate', 'handWash'] })).toBe('hand');
    expect(programOf({ washTags: ['handWash', 'dryClean'] })).toBe('dryClean');
  });
  it('divide i colori in chiari, colorati e scuri', () => {
    expect(colorGroupOf({ colors: ['white'] })).toBe('light');
    expect(colorGroupOf({ colors: ['denim', 'white'] })).toBe('dark');
    expect(colorGroupOf({ colors: ['yellow'] })).toBe('colored');
    expect(colorGroupOf({ colors: [] })).toBe('colored');
  });
  it('riconosce il rischio che un colore stinga sui bianchi', () => {
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['red'] }])).toBe(true);
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['navy'] }])).toBe(true);
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['yellow'] }])).toBe(false);
    expect(hasBleedRisk([{ colors: ['black'] }, { colors: ['red'] }])).toBe(false);
  });
});

describe('carichi suggeriti', () => {
  const tee = item({ name: 'T-shirt bianca', colors: ['white'], washTags: ['max40'] });
  const jeans = item({ name: 'Jeans', colors: ['denim'], washTags: ['max40'] });
  const top = item({ name: 'Top giallo', colors: ['yellow'], washTags: ['max40'] });
  const silk = item({ name: 'Camicia di seta', colors: ['white'], washTags: ['handWash'] });
  const sock = item({ name: 'Calzini', colors: ['black'], washTags: ['handWash'] });

  it('divide per colore solo quando bianchi e scuri finirebbero insieme', () => {
    const loads = buildLoads([tee, jeans, top]);
    expect(loads.map((l) => loadTitle(l))).toEqual(['40° · Chiari', '40° · Colorati', '40° · Scuri']);
    expect(loads.every((l) => l.split && !l.warning)).toBe(true);
    const safe = buildLoads([tee, top]);
    expect(safe).toHaveLength(1);
    expect(safe[0]).toMatchObject({ colorGroup: null, warning: false });
  });

  it('con "lava tutto insieme" tiene un carico e mostra l’avviso', () => {
    const loads = buildLoads([tee, jeans], new Set(['wash40']));
    expect(loads).toHaveLength(1);
    expect(loads[0]?.warning).toBe(true);
  });

  it('il lavaggio a mano non si divide ma avvisa', () => {
    const loads = buildLoads([silk, sock]);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ program: 'hand', warning: true });
  });

  it('ordina i programmi dal più delicato', () => {
    expect(buildLoads([tee, silk]).map((l) => l.program)).toEqual(['hand', 'wash40']);
  });
});

describe('panoramica lavanderia', () => {
  it('raggruppa macchie, stesi, da stirare, manutenzione e capi arrivati alla soglia', () => {
    const o = laundryOverview([
      item({ name: 'B', hasStain: true }),
      item({ name: 'A' }),
      item({ status: 'drying' }),
      item({ status: 'toIron' }),
      item({ status: 'maintenance' }),
      item({ status: 'clean', wearsSinceWash: 1, maxWearsBeforeWash: 1 }),
      item({ status: 'clean', wearsSinceWash: 0, maxWearsBeforeWash: 1 }),
    ]);
    expect(o.stains.map((i) => i.name)).toEqual(['B']);
    expect(o.toWash.map((i) => i.name)).toEqual(['A', 'B']);
    expect([o.drying.length, o.toIron.length, o.maintenance.length, o.dueSoon.length]).toEqual([1, 1, 1, 1]);
  });
});

describe('cambio stagione', () => {
  const box = 'box';
  const list = [
    item({ name: 'Cappotto', status: 'clean', season: 'autumnWinter' }),
    item({ name: 'Maglione prestato', status: 'onLoan', season: 'autumnWinter' }),
    item({ name: 'Maglione in valigia', status: 'packed', season: 'autumnWinter' }),
    item({ name: 'Felpa già riposta', status: 'clean', season: 'autumnWinter', locationId: box }),
    item({ name: 'Jeans', status: 'clean', season: 'allSeasons' }),
    item({ name: 'Shorts riposti', status: 'clean', season: 'springSummer', locationId: box }),
  ];

  it('ripone solo i capi della stagione che si possono spostare', () => {
    const c = storeCandidates(list, 'autumnWinter', box);
    expect(c.movable.map((i) => i.name)).toEqual(['Cappotto']);
    expect(c.skipped.map((i) => i.name)).toEqual(['Maglione prestato', 'Maglione in valigia']);
  });

  it('tira fuori dalla scatola, anche per stagione', () => {
    expect(returnCandidates(list, box, null)).toHaveLength(2);
    expect(returnCandidates(list, box, 'springSummer').map((i) => i.name)).toEqual(['Shorts riposti']);
  });

  it('suggerisce cosa riporre in base al mese', () => {
    expect(suggestedSeasonToStore(4)).toBe('autumnWinter');
    expect(suggestedSeasonToStore(10)).toBe('springSummer');
  });
});
