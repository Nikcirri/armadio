import { describe, expect, it } from 'vitest';
import type { ItemRecord, SlotType } from '../db/types';
import { createItem } from './factories';
import { garmentsFor, isUnderwear, joinNames, linkedUnderwear, relinkUnderwear, suggestUnderwear } from './underwear';

const NOW = '2026-11-06T10:00:00.000Z';
const item = (id: string, slot: SlotType, over: Partial<ItemRecord> = {}) =>
  createItem({ name: id, ...over, id }, { id: `c-${slot}`, slotType: slot, defaultMaxWears: 1 }, NOW);

const braWhite = item('Reggiseno bianco', 'underwear');
const braNude = item('Reggiseno nude', 'underwear');
const strapless = item('Senza spalline', 'underwear', { status: 'toWash' });
const tee = item('Maglietta bianca', 'top_base', { underwearIds: ['Reggiseno bianco', 'Reggiseno nude'] });
const shirt = item('Camicia', 'top_base', { underwearIds: ['Reggiseno nude'] });
const dress = item('Abito rosso', 'full_body', { underwearIds: ['Senza spalline', 'sparito'] });
const jeans = item('Jeans', 'bottom');
const all = [braWhite, braNude, strapless, tee, shirt, dress, jeans];
const byId = new Map(all.map((i) => [i.id, i]));

describe('intimo', () => {
  it('riconosce l’intimo e i collegamenti validi', () => {
    expect(isUnderwear(braWhite)).toBe(true);
    expect(isUnderwear(tee)).toBe(false);
    expect(linkedUnderwear(tee, byId).map((i) => i.id)).toEqual(['Reggiseno bianco', 'Reggiseno nude']);
    // id spariti o capi che non sono più intimo non contano
    expect(linkedUnderwear(dress, byId).map((i) => i.id)).toEqual(['Senza spalline']);
    expect(linkedUnderwear(item('x', 'top_base', { underwearIds: ['Jeans'] }), byId)).toEqual([]);
    expect(garmentsFor('Reggiseno nude', all).map((i) => i.id)).toEqual(['Camicia', 'Maglietta bianca']);
  });

  it('propone il primo disponibile e un solo capo intimo per più capi', () => {
    // da sola la maglietta prende il suo primo, il reggiseno bianco
    expect(suggestUnderwear([tee, jeans], byId, null).map((x) => [x.item.id, x.forNames, x.reason])).toEqual([
      ['Reggiseno bianco', ['Maglietta bianca'], null],
    ]);
    // con la camicia, il nude va bene per tutte e due: uno solo
    expect(suggestUnderwear([tee, shirt], byId, null).map((x) => [x.item.id, x.forNames])).toEqual([
      ['Reggiseno nude', ['Maglietta bianca', 'Camicia']],
    ]);
    // se il bianco è da lavare, la maglietta da sola prende il nude
    const dirty = new Map(byId).set('Reggiseno bianco', { ...braWhite, status: 'toWash' });
    expect(suggestUnderwear([tee], dirty, null).map((x) => x.item.id)).toEqual(['Reggiseno nude']);
    // abito e maglietta hanno intimo diverso: due proposte, nell'ordine dei capi
    expect(suggestUnderwear([dress, tee], byId, null).map((x) => x.item.id)).toEqual(['Senza spalline', 'Reggiseno bianco']);
  });

  it('dice il motivo se nessuno è disponibile e salta i capi già coperti', () => {
    expect(suggestUnderwear([dress], byId, null).map((x) => [x.item.id, x.reason])).toEqual([['Senza spalline', 'da lavare']]);
    expect(suggestUnderwear([tee, shirt], byId, null, ['Reggiseno nude'])).toEqual([]);
    // per la valigia la scelta resta la stessa anche se il primo non è disponibile
    const dirty = new Map(byId).set('Reggiseno bianco', { ...braWhite, status: 'packed' });
    expect(suggestUnderwear([tee], dirty, null, [], false)[0]?.item.id).toBe('Reggiseno bianco');
  });

  it('aggiorna "Va sotto a" toccando solo i capi che cambiano', () => {
    expect(relinkUnderwear('Reggiseno nude', ['Camicia', 'Jeans'], all)).toEqual([
      { id: 'Maglietta bianca', underwearIds: ['Reggiseno bianco'] },
      { id: 'Jeans', underwearIds: ['Reggiseno nude'] },
    ]);
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B e C');
  });
});
