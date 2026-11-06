import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from './schema';
import { getCategories, setupNewWardrobe } from './repo';
import { addItem } from './items';
import {
  addTrip,
  deleteTemplate,
  deleteTrip,
  patchTrip,
  restorePlan,
  restoreTemplate,
  restoreTrip,
  saveTemplate,
  setInTransit,
  setPacked,
  setPlan,
  unpackTrip,
  updateTrip,
  type TripInput,
} from './agenda';

let db: ArmadioDB;
let n = 0;

beforeEach(async () => {
  n += 1;
  db = new ArmadioDB(`agenda-${n}`);
  await setupNewWardrobe(db, { preset: 'neutro', userName: '', palette: 'sabbia', mode: 'system' });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

async function city(): Promise<string> {
  const t = await db.lists.where('kind').equals('packingTemplate').filter((l) => l.extra.key === 'city').first();
  return t!.id;
}

const trip = (over: Partial<TripInput> = {}): TripInput => ({
  name: ' Firenze ',
  startDate: '2026-11-13',
  endDate: '2026-11-15',
  luggageType: 'cabin',
  templateId: null,
  weather: ' Mite ',
  ...over,
});

async function jeans() {
  const cat = (await getCategories(db)).find((c) => c.slotType === 'bottom')!;
  return addItem(db, { name: 'Jeans', categoryId: cat.id, colors: [], photoIds: [] });
}

describe('giorni dell’agenda', () => {
  it('salva, svuota e ripristina un giorno', async () => {
    const before = await setPlan(db, '2026-11-10', { outfitId: null, itemIds: ['a', 'a', 'b'], note: '  Cena  ' });
    expect(before).toBeNull();
    expect(await db.planner.get('2026-11-10')).toMatchObject({ itemIds: ['a', 'b'], note: 'Cena' });
    const prev = await setPlan(db, '2026-11-10', { outfitId: null, itemIds: [], note: '' });
    expect(await db.planner.get('2026-11-10')).toBeUndefined();
    await restorePlan(db, '2026-11-10', prev);
    expect((await db.planner.get('2026-11-10'))?.note).toBe('Cena');
    await restorePlan(db, '2026-11-10', null);
    expect(await db.planner.count()).toBe(0);
  });
});

describe('viaggi', () => {
  it('crea il viaggio con il necessaire calcolato sui giorni', async () => {
    const t = await addTrip(db, trip({ templateId: await city() }));
    expect(t).toMatchObject({ name: 'Firenze', weather: 'Mite', status: 'planning' });
    expect(t.checklist.find((c) => c.label === 'Intimo')?.qty).toBe(4);
    expect(t.checklist.find((c) => c.label === 'Pigiama')?.qty).toBe(1);
    const swapped = await addTrip(db, trip({ startDate: '2026-11-20', endDate: '2026-11-18', name: '' }));
    expect(swapped).toMatchObject({ name: 'Viaggio', startDate: '2026-11-18', endDate: '2026-11-20' });
  });

  it('cambiando le date ricalcola le quantità e tiene le voci aggiunte', async () => {
    const t = await addTrip(db, trip({ templateId: await city() }));
    const checklist = [...t.checklist.map((c) => (c.label === 'Intimo' ? { ...c, checked: true } : c)), { id: 'x', label: 'Ombrello', qty: 1, checked: false }];
    await patchTrip(db, t.id, { checklist });
    const longer = await updateTrip(db, t.id, trip({ templateId: t.templateId, endDate: '2026-11-19' }));
    expect(longer.checklist.find((c) => c.label === 'Intimo')).toMatchObject({ qty: 8, checked: true });
    expect(longer.checklist.find((c) => c.label === 'Ombrello')?.qty).toBe(1);
    const noTemplate = await updateTrip(db, t.id, trip({ templateId: null, endDate: '2026-11-19' }));
    expect(noTemplate.checklist).toEqual([]);
  });

  it('spunta mette in valigia, togliere la spunta rimette Pulito senza azzerare gli utilizzi', async () => {
    const t = await addTrip(db, trip());
    const j = await jeans();
    await db.items.update(j.id, { wearsSinceWash: 2 });
    await setPacked(db, t.id, j.id, true);
    expect((await db.items.get(j.id))?.status).toBe('packed');
    expect((await db.trips.get(t.id))?.packedItemIds).toEqual([j.id]);
    await setPacked(db, t.id, j.id, false);
    expect(await db.items.get(j.id)).toMatchObject({ status: 'clean', wearsSinceWash: 2 });
    expect((await db.trips.get(t.id))?.packedItemIds).toEqual([]);
    await setInTransit(db, t.id, j.id, true);
    expect((await db.trips.get(t.id))?.wearInTransitIds).toEqual([j.id]);
    await setInTransit(db, t.id, j.id, false);
    expect((await db.trips.get(t.id))?.wearInTransitIds).toEqual([]);
  });

  it('Disfa valigia: Da lavare o Pulito e viaggio concluso', async () => {
    const t = await addTrip(db, trip());
    const j = await jeans();
    const k = await jeans();
    await setPacked(db, t.id, j.id, true);
    await setPacked(db, t.id, k.id, true);
    const snap = await unpackTrip(db, t.id, { [j.id]: 'toWash', [k.id]: 'clean' });
    expect((await db.items.get(j.id))?.status).toBe('toWash');
    expect((await db.items.get(k.id))?.status).toBe('clean');
    expect((await db.trips.get(t.id))?.status).toBe('done');
    await restoreTrip(db, snap);
    expect((await db.items.get(j.id))?.status).toBe('packed');
    expect((await db.trips.get(t.id))?.status).toBe('planning');
  });

  it('eliminando il viaggio i capi in valigia tornano Puliti; Annulla rimette tutto', async () => {
    const t = await addTrip(db, trip());
    const j = await jeans();
    await setPacked(db, t.id, j.id, true);
    await setPlan(db, '2026-11-13', { outfitId: null, itemIds: [j.id], note: '' });
    const snap = await deleteTrip(db, t.id);
    expect(await db.trips.count()).toBe(0);
    expect((await db.items.get(j.id))?.status).toBe('clean');
    expect(await db.planner.get('2026-11-13')).toBeDefined();
    await restoreTrip(db, snap);
    expect((await db.items.get(j.id))?.status).toBe('packed');
    expect(await db.trips.count()).toBe(1);
  });
});

describe('template della valigia', () => {
  it('crea, modifica, elimina e ripristina', async () => {
    const before = await db.lists.where('kind').equals('packingTemplate').count();
    const t = await saveTemplate(db, { name: ' Sci ', essentials: [{ label: ' Guanti ', rule: 'fixed', qty: 0 }, { label: '', rule: 'perDay', qty: 1 }] });
    expect(t).toMatchObject({ name: 'Sci', order: before, extra: { essentials: [{ label: 'Guanti', rule: 'fixed', qty: 1 }] } });
    const u = await saveTemplate(db, { name: 'Sci e neve', essentials: [{ label: 'Calze', rule: 'perDay', qty: 2 }] }, t.id);
    expect(u.extra.essentials).toEqual([{ label: 'Calze', rule: 'perDay', qty: 2 }]);
    const removed = await deleteTemplate(db, t.id);
    expect(await db.lists.get(t.id)).toBeUndefined();
    await restoreTemplate(db, removed);
    expect((await db.lists.get(t.id))?.name).toBe('Sci e neve');
    const cat = (await db.lists.where('kind').equals('occasion').first())!;
    await expect(deleteTemplate(db, cat.id)).rejects.toThrow();
  });
});
