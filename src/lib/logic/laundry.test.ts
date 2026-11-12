import { describe, expect, it } from 'vitest';
import type { ItemRecord } from '../db/types';
import { createItem } from './factories';
import {
  buildLoads,
  colorGroupOf,
  gentlestProgram,
  hasBleedRisk,
  laundryOverview,
  loadTitle,
  machineLoadCount,
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
    expect(colorGroupOf({ colors: ['charcoal'] })).toBe('dark');
    expect(colorGroupOf({ colors: ['chocolate'] })).toBe('dark');
    expect(colorGroupOf({ colors: ['forest'] })).toBe('dark');
    expect(colorGroupOf({ colors: ['lightBlue'] })).toBe('colored');
    expect(colorGroupOf({ colors: ['camel'] })).toBe('colored');
  });
  it('riconosce il rischio che un colore stinga sui bianchi', () => {
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['red'] }])).toBe(true);
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['navy'] }])).toBe(true);
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['yellow'] }])).toBe(false);
    expect(hasBleedRisk([{ colors: ['black'] }, { colors: ['red'] }])).toBe(false);
    expect(hasBleedRisk([{ colors: ['cream'] }, { colors: ['fuchsia'] }])).toBe(true);
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['rust'] }])).toBe(true);
    expect(hasBleedRisk([{ colors: ['white'] }, { colors: ['lilac'] }])).toBe(false);
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
    const loads = buildLoads([tee, jeans], { together: true });
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ program: 'wash40', warning: true, programs: ['wash40'] });
    expect(loadTitle(loads[0]!)).toBe('40°');
  });

  it('"lava tutto insieme" unisce le temperature con il programma più delicato', () => {
    const shirt = item({ name: 'Camicia', colors: ['denim'], washTags: ['max30'] });
    const trousers = item({ name: 'Pantaloni', colors: ['black'], washTags: ['delicate'] });
    const darkTee = item({ name: 'T-shirt nera', colors: ['black'], washTags: ['max40'] });
    const loads = buildLoads([shirt, trousers, darkTee, sock], { together: true });
    expect(loads.map((l) => l.program)).toEqual(['hand', 'delicate']);
    const machine = loads[1]!;
    expect(machine.items).toHaveLength(3);
    expect(machine.programs).toEqual(['delicate', 'wash30', 'wash40']);
    expect(machine.warning).toBe(false);
    expect(loadTitle(machine)).toBe('Delicati · Tutto insieme');
  });

  it('a mano e a secco restano a parte anche lavando tutto insieme', () => {
    const coat = item({ name: 'Trench', colors: ['cream'], washTags: ['dryClean'] });
    const loads = buildLoads([tee, silk, coat], { together: true });
    expect(loads.map((l) => l.program)).toEqual(['hand', 'wash40', 'dryClean']);
  });

  it('lavando tutto insieme avvisa per i bianchi e li può dividere per colore', () => {
    const trousers = item({ name: 'Pantaloni', colors: ['black'], washTags: ['max30'] });
    const together = buildLoads([tee, trousers], { together: true });
    expect(together).toHaveLength(1);
    expect(together[0]).toMatchObject({ program: 'wash30', warning: true });
    const split = buildLoads([tee, trousers], { together: true, splitColors: true });
    expect(split.map((l) => loadTitle(l))).toEqual(['30° · Chiari', '30° · Scuri']);
    expect(split.every((l) => l.split && !l.warning && l.programs.length === 2)).toBe(true);
  });

  it('conta le lavatrici e trova il programma più delicato', () => {
    expect(machineLoadCount(buildLoads([tee, silk]))).toBe(1);
    expect(machineLoadCount(buildLoads([tee, jeans]))).toBe(2);
    expect(gentlestProgram(['wash40', 'delicate', 'wash30'])).toBe('delicate');
    expect(gentlestProgram([])).toBeNull();
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
