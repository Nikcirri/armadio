// Scorciatoie sull'icona e widget "Armadio – Oggi" (SPEC.md, sezione 8.7). Solo nell'app Android:
// il plugin HomeWidget (android/app/src/main/java/com/nikcirri/armadio/HomeWidgetPlugin.java)
// conserva i dati per il widget, che li legge anche ad app chiusa.
import { App as CapApp } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { liveQuery, type Subscription } from 'dexie';
import { db } from './db';
import type { ItemRecord, OutfitRecord, PhotoRecord } from './db/types';
import { reportError } from './errors';
import { u8ToBase64 } from './logic/bytes';
import { addDays, todayKey } from './logic/util';
import { WIDGET_DAYS, parseShortcutUrl, widgetDays, widgetSignature, type ShortcutAction, type WidgetDay } from './logic/widget';
import { isNative } from './platform';

interface HomeWidgetPlugin {
  /** Salva i giorni e le miniature (base64, per id del capo) e ridisegna i widget. */
  update(options: { days: WidgetDay[]; images: Record<string, string> }): Promise<void>;
}

const HomeWidget = registerPlugin<HomeWidgetPlugin>('HomeWidget');

/** Ultima impronta mandata al widget: sopravvive alla chiusura dell'app. */
const SIGNATURE_KEY = 'armadio.widgetSignature';

interface Snapshot {
  days: WidgetDay[];
  photos: Map<string, PhotoRecord>;
  signature: string;
}

async function readSnapshot(today: string): Promise<Snapshot> {
  const last = addDays(today, WIDGET_DAYS - 1);
  const [wear, planner] = await Promise.all([
    db.wearLog.where('date').equals(today).toArray(),
    db.planner.where('date').between(today, last, true, true).toArray(),
  ]);
  const outfitIds = [...new Set([...wear.map((w) => w.outfitId), ...planner.map((p) => p.outfitId)].filter((id): id is string => !!id))];
  const outfitList = (await db.outfits.bulkGet(outfitIds)).filter((o): o is OutfitRecord => !!o);
  const itemIds = [...new Set([...wear.flatMap((w) => w.itemIds), ...planner.flatMap((p) => p.itemIds), ...outfitList.flatMap((o) => o.itemIds)])];
  const itemList = (await db.items.bulkGet(itemIds)).filter((i): i is ItemRecord => !!i);
  const items = new Map(itemList.map((i) => [i.id, i]));
  const days = widgetDays({ today, wear, planner, outfits: new Map(outfitList.map((o) => [o.id, o])), items });
  const shown = [...new Set(days.flatMap((d) => d.itemIds))];
  const photoRecords = await db.photos.bulkGet(shown.map((id) => items.get(id)?.photoIds[0] ?? ''));
  const photos = new Map<string, PhotoRecord>();
  const stamps = new Map<string, string>();
  shown.forEach((id, i) => {
    const photo = photoRecords[i];
    if (!photo) return;
    photos.set(id, photo);
    stamps.set(id, `${photo.id}@${photo.updatedAt}`);
  });
  return { days, photos, signature: widgetSignature(days, stamps) };
}

function storedSignature(): string | null {
  try {
    return localStorage.getItem(SIGNATURE_KEY);
  } catch {
    return null;
  }
}

function storeSignature(sig: string): void {
  try {
    localStorage.setItem(SIGNATURE_KEY, sig);
  } catch {
    // Senza localStorage si rimanda tutto alla prossima apertura: va bene lo stesso.
  }
}

async function send(snap: Snapshot): Promise<void> {
  if (snap.signature === storedSignature()) return;
  const images: Record<string, string> = {};
  for (const [id, photo] of snap.photos) images[id] = u8ToBase64(new Uint8Array(await photo.thumb.arrayBuffer()));
  await HomeWidget.update({ days: snap.days, images });
  storeSignature(snap.signature);
}

/**
 * Tiene aggiornato il widget: legge oggi e i 7 giorni seguenti e li manda quando cambiano
 * (agenda, storico, outfit, capi, foto), al massimo una volta ogni mezzo secondo.
 * Restituisce i comandi per ripartire (al ritorno nell'app, magari il giorno dopo),
 * mandare subito ciò che è in attesa (quando l'app va in background) e fermarsi.
 */
export function startWidgetSync(): { restart: () => void; flush: () => void; stop: () => void } {
  if (!isNative()) return { restart: () => undefined, flush: () => undefined, stop: () => undefined };
  let sub: Subscription | null = null;
  let pending: Snapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let today = '';

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const snap = pending;
    pending = null;
    if (snap) send(snap).catch(reportError);
  };

  const subscribe = () => {
    sub?.unsubscribe();
    today = todayKey();
    const day = today;
    sub = liveQuery(() => readSnapshot(day)).subscribe({
      next: (snap) => {
        pending = snap;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 500);
      },
      error: (e) => reportError(e),
    });
  };

  subscribe();
  return {
    restart: () => {
      if (todayKey() !== today) subscribe();
      else flush();
    },
    flush,
    stop: () => {
      flush();
      sub?.unsubscribe();
      sub = null;
    },
  };
}

/**
 * Tocco su una scorciatoia o su un pulsante del widget: arriva anche ad app chiusa,
 * appena l'app si apre (Capacitor conserva l'evento finché qualcuno lo ascolta).
 */
export function onShortcut(handler: (action: ShortcutAction) => void): () => void {
  if (!isNative()) return () => undefined;
  const listener = CapApp.addListener('appUrlOpen', ({ url }) => {
    const action = parseShortcutUrl(url);
    if (action) handler(action);
  });
  return () => {
    void listener.then((l) => l.remove());
  };
}
