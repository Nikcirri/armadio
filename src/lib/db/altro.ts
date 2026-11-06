import type { ArmadioDB } from './schema';
import type { ColorId, ItemRecord, ListKind, ListRecord, OutfitRecord, PhotoRecord, Season, SettingsMap, WishlistRecord } from './types';
import { addItem } from './items';
import { swapWithinGroup } from '../logic/integrity';
import { isProtected, nameTaken, renameIn, withoutOccasion, type EditableKind } from '../logic/lists';
import { newId, nowIso } from '../logic/util';

// Sezione Altro (SPEC.md, sezione 8.5): wishlist e liste.

// ---------- Wishlist ----------

export interface WishInput {
  name: string;
  categoryId: string | null;
  photoIds: string[];
  price: number | null;
  storeOrLink: string;
  colors: ColorId[];
  season: Season | null;
  occasions: string[];
  priority: WishlistRecord['priority'];
  notes: string;
}

export async function saveWish(db: ArmadioDB, input: WishInput, id: string | null = null): Promise<WishlistRecord> {
  const now = nowIso();
  const clean = { ...input, name: input.name.trim() || 'Desiderio', storeOrLink: input.storeOrLink.trim(), notes: input.notes.trim() };
  return db.transaction('rw', db.wishlist, db.photos, async () => {
    if (id) {
      const existing = await db.wishlist.get(id);
      if (!existing) throw new Error('Desiderio non trovato');
      const removed = existing.photoIds.filter((p) => !clean.photoIds.includes(p));
      if (removed.length) await db.photos.bulkDelete(removed);
      const updated: WishlistRecord = { ...existing, ...clean, updatedAt: now };
      await db.wishlist.put(updated);
      return updated;
    }
    const created: WishlistRecord = { id: newId(), ...clean, createdAt: now, updatedAt: now };
    await db.wishlist.add(created);
    return created;
  });
}

export interface WishDeletionSnapshot {
  wish: WishlistRecord;
  photos: PhotoRecord[];
  outfits: OutfitRecord[];
}

/** Elimina il desiderio con le sue foto e lo toglie dagli outfit. */
export async function deleteWish(db: ArmadioDB, id: string): Promise<WishDeletionSnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.wishlist, db.photos, db.outfits], async () => {
    const wish = await db.wishlist.get(id);
    if (!wish) throw new Error('Desiderio non trovato');
    const photos = (await db.photos.bulkGet(wish.photoIds)).filter((p): p is PhotoRecord => !!p);
    const outfits = await db.outfits.filter((o) => o.wishlistIds.includes(id)).toArray();
    await db.outfits.bulkPut(
      outfits.map((o) => ({ ...o, wishlistIds: o.wishlistIds.filter((x) => x !== id), layout: o.layout.filter((l) => l.itemId !== id), updatedAt: now })),
    );
    await db.photos.bulkDelete(wish.photoIds);
    await db.wishlist.delete(id);
    return { wish, photos, outfits };
  });
}

export async function restoreWish(db: ArmadioDB, snap: WishDeletionSnapshot): Promise<void> {
  await db.transaction('rw', [db.wishlist, db.photos, db.outfits], async () => {
    await db.photos.bulkPut(snap.photos);
    await db.wishlist.put(snap.wish);
    await db.outfits.bulkPut(snap.outfits);
  });
}

export interface PurchaseSnapshot {
  wish: WishlistRecord;
  itemId: string;
  outfits: OutfitRecord[];
}

/**
 * "Comprato!": il desiderio diventa un capo dell'armadio con le stesse foto e gli stessi dati.
 * Negli outfit il desiderio viene sostituito dal capo (anche nella disposizione del collage).
 */
export async function purchaseWish(
  db: ArmadioDB,
  id: string,
  input: { categoryId: string; price: number | null; purchaseDate: string | null },
): Promise<{ item: ItemRecord; snapshot: PurchaseSnapshot }> {
  const now = nowIso();
  return db.transaction('rw', [db.wishlist, db.items, db.categories, db.lists, db.outfits], async () => {
    const wish = await db.wishlist.get(id);
    if (!wish) throw new Error('Desiderio non trovato');
    const base = await addItem(db, { name: wish.name, categoryId: input.categoryId, colors: wish.colors, photoIds: wish.photoIds });
    const item: ItemRecord = {
      ...base,
      price: input.price,
      purchaseDate: input.purchaseDate,
      season: wish.season ?? base.season,
      occasions: [...wish.occasions],
      notes: [wish.notes, wish.storeOrLink ? `Comprato da: ${wish.storeOrLink}` : ''].filter(Boolean).join('\n'),
      updatedAt: now,
    };
    await db.items.put(item);
    const outfits = await db.outfits.filter((o) => o.wishlistIds.includes(id)).toArray();
    await db.outfits.bulkPut(
      outfits.map((o) => ({
        ...o,
        wishlistIds: o.wishlistIds.filter((x) => x !== id),
        itemIds: o.itemIds.includes(item.id) ? o.itemIds : [...o.itemIds, item.id],
        layout: o.layout.map((l) => (l.itemId === id ? { ...l, itemId: item.id } : l)),
        updatedAt: now,
      })),
    );
    await db.wishlist.delete(id);
    return { item, snapshot: { wish, itemId: item.id, outfits } };
  });
}

/** Annulla "Comprato!": il capo sparisce (le foto restano al desiderio) e gli outfit tornano com'erano. */
export async function undoPurchase(db: ArmadioDB, snap: PurchaseSnapshot): Promise<void> {
  await db.transaction('rw', [db.wishlist, db.items, db.outfits], async () => {
    await db.items.delete(snap.itemId);
    await db.wishlist.put(snap.wish);
    await db.outfits.bulkPut(snap.outfits);
  });
}

// ---------- Liste ----------

export async function addListEntry(db: ArmadioDB, kind: EditableKind, name: string): Promise<ListRecord> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Scrivi un nome');
  return db.transaction('rw', db.lists, async () => {
    const all = await db.lists.toArray();
    if (nameTaken(all, kind, clean)) throw new Error(`C’è già “${clean}”`);
    const order = all.filter((l) => l.kind === kind).reduce((m, l) => Math.max(m, l.order), -1) + 1;
    const now = nowIso();
    const entry: ListRecord = { id: newId(), kind, name: clean, order, extra: {}, createdAt: now, updatedAt: now };
    await db.lists.add(entry);
    return entry;
  });
}

/** Rinomina; per tessuti, tag di manutenzione e persone il nome cambia anche nei capi e nel diario. */
export async function renameListEntry(db: ArmadioDB, id: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Scrivi un nome');
  const now = nowIso();
  await db.transaction('rw', [db.lists, db.items, db.diary], async () => {
    const entry = await db.lists.get(id);
    if (!entry) throw new Error('Voce non trovata');
    const all = await db.lists.toArray();
    if (nameTaken(all, entry.kind, clean, id)) throw new Error(`C’è già “${clean}”`);
    const old = entry.name;
    await db.lists.put({ ...entry, name: clean, updatedAt: now });
    if (old === clean) return;
    if (entry.kind === 'fabric' || entry.kind === 'maintenance') {
      const field = entry.kind === 'fabric' ? 'fabrics' : 'maintenanceTags';
      const items = await db.items.filter((i) => i[field].includes(old)).toArray();
      await db.items.bulkPut(items.map((i) => ({ ...i, [field]: renameIn(i[field], old, clean), updatedAt: now })));
    } else if (entry.kind === 'person') {
      const diary = await db.diary.filter((d) => d.people.includes(old)).toArray();
      await db.diary.bulkPut(diary.map((d) => ({ ...d, people: renameIn(d.people, old, clean), updatedAt: now })));
    }
  });
}

export async function moveListEntry(db: ArmadioDB, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.lists, async () => {
    const entry = await db.lists.get(id);
    if (!entry) return;
    const same = await db.lists.where('kind').equals(entry.kind).toArray();
    const changed = swapWithinGroup(same, id, direction, () => true);
    await db.lists.bulkPut(changed.map((l) => ({ ...l, updatedAt: nowIso() })));
  });
}

export interface ListDeletionSnapshot {
  entry: ListRecord;
  items: ItemRecord[];
  outfits: OutfitRecord[];
  wishlist: WishlistRecord[];
  matrix: SettingsMap['occasionMatrix'] | null;
}

/** Quanti capi (o outfit) usano questa voce: per il messaggio di conferma. */
export async function listEntryUsage(db: ArmadioDB, entry: ListRecord): Promise<number> {
  switch (entry.kind as ListKind) {
    case 'owner':
      return db.items.where('ownerId').equals(entry.id).count();
    case 'location':
      return db.items.where('locationId').equals(entry.id).count();
    case 'occasion':
      return (await db.items.filter((i) => i.occasions.includes(entry.id)).count()) + (await db.outfits.filter((o) => o.occasions.includes(entry.id)).count());
    case 'fabric':
      return db.items.filter((i) => i.fabrics.includes(entry.name)).count();
    case 'maintenance':
      return db.items.filter((i) => i.maintenanceTags.includes(entry.name)).count();
    default:
      return 0;
  }
}

/**
 * Elimina una voce. Proprietario → i capi passano a "Mio"; posizione → all'Armadio principale;
 * occasione → tolta da capi, outfit, wishlist e matrice. Tessuti, tag e persone restano scritti nei capi.
 */
export async function deleteListEntry(db: ArmadioDB, id: string): Promise<ListDeletionSnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.lists, db.items, db.outfits, db.wishlist, db.settings], async () => {
    const entry = await db.lists.get(id);
    if (!entry) throw new Error('Voce non trovata');
    if (isProtected(entry)) throw new Error(`“${entry.name}” serve all’app: puoi rinominarla ma non eliminarla`);
    const snap: ListDeletionSnapshot = { entry, items: [], outfits: [], wishlist: [], matrix: null };
    const keyed = async (kind: ListKind, key: string) =>
      (await db.lists.where('kind').equals(kind).filter((l) => l.extra.key === key).first())?.id ?? null;
    if (entry.kind === 'owner' || entry.kind === 'location') {
      const field = entry.kind === 'owner' ? 'ownerId' : 'locationId';
      const target = await keyed(entry.kind, entry.kind === 'owner' ? 'mine' : 'main');
      snap.items = await db.items.where(field).equals(id).toArray();
      await db.items.bulkPut(snap.items.map((i) => ({ ...i, [field]: target, updatedAt: now })));
    } else if (entry.kind === 'occasion') {
      const without = <T extends { occasions: string[] }>(r: T): T => ({ ...r, occasions: r.occasions.filter((x) => x !== id), updatedAt: now });
      snap.items = await db.items.filter((i) => i.occasions.includes(id)).toArray();
      snap.outfits = await db.outfits.filter((o) => o.occasions.includes(id)).toArray();
      snap.wishlist = await db.wishlist.filter((w) => w.occasions.includes(id)).toArray();
      await db.items.bulkPut(snap.items.map(without));
      await db.outfits.bulkPut(snap.outfits.map(without));
      await db.wishlist.bulkPut(snap.wishlist.map(without));
      const rec = await db.settings.get('occasionMatrix');
      if (rec) {
        snap.matrix = rec.value as SettingsMap['occasionMatrix'];
        await db.settings.put({ key: 'occasionMatrix', value: withoutOccasion(snap.matrix, id) });
      }
    }
    await db.lists.delete(id);
    return snap;
  });
}

export async function restoreListDeletion(db: ArmadioDB, snap: ListDeletionSnapshot): Promise<void> {
  await db.transaction('rw', [db.lists, db.items, db.outfits, db.wishlist, db.settings], async () => {
    await db.lists.put(snap.entry);
    await db.items.bulkPut(snap.items);
    await db.outfits.bulkPut(snap.outfits);
    await db.wishlist.bulkPut(snap.wishlist);
    if (snap.matrix) await db.settings.put({ key: 'occasionMatrix', value: snap.matrix });
  });
}

