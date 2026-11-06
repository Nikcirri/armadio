import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from './db';
import { getSetting } from './db/repo';
import { reminderTime } from './logic/outfits';
import { todayKey } from './logic/util';
import { isNative } from './platform';

// Promemoria serale "Fine giornata" (SPEC.md, sezione 8.2): una notifica locale, solo nei giorni
// in cui hai indossato qualcosa e non hai ancora deciso cosa mettere a lavare.

const END_OF_DAY_ID = 501;
const CHANNEL_ID = 'fine-giornata';
export const END_OF_DAY_ACTION = 'endOfDay';

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Fine giornata',
    description: 'Promemoria serale per scegliere i capi da lavare',
    importance: 4,
    visibility: 1,
  });
  channelReady = true;
}

/** Chiede il permesso di mostrare notifiche (Android 13 e successivi). */
export async function askNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

async function cancelReminder(): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: END_OF_DAY_ID }] });
}

/** Rimette in ordine il promemoria di oggi in base a impostazioni e capi in attesa. */
export async function refreshEndOfDayReminder(): Promise<void> {
  if (!isNative()) return;
  await cancelReminder();
  const [prefs, pending] = await Promise.all([getSetting(db, 'notifications'), getSetting(db, 'endOfDay')]);
  const today = todayKey();
  if (!prefs?.eveningReminder || !pending || pending.date !== today) return;
  const at = reminderTime(today, prefs.time, new Date());
  if (!at) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: END_OF_DAY_ID,
        title: 'Fine giornata',
        body: 'Com’è andata? Scegli quali capi mettere a lavare.',
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { action: END_OF_DAY_ACTION },
      },
    ],
  });
}

/** Tocco sulla notifica: anche ad app chiusa arriva appena l'app si apre. */
export function onNotificationTap(handler: (action: string) => void): () => void {
  if (!isNative()) return () => undefined;
  const listener = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const action: unknown = event.notification.extra?.action;
    if (typeof action === 'string') handler(action);
  });
  return () => {
    void listener.then((l) => l.remove());
  };
}
