import { db } from '../../lib/db';
import { applyEndOfDay, undoEndOfDay, undoWear, wearItems } from '../../lib/db/outfits';
import { formatDateIt, todayKey } from '../../lib/logic/util';
import { refreshEndOfDayReminder } from '../../lib/notify';
import { tapFeedback } from '../../lib/platform';
import { showUndoToast } from '../../lib/state/ui.svelte';
import { reportError } from '../../lib/errors';

// Azioni condivise della sezione Outfit (anche "Cosa metto?" le userà).

async function syncReminder(): Promise<void> {
  try {
    await refreshEndOfDayReminder();
  } catch (e) {
    console.error(e);
  }
}

/** Segna i capi come indossati, con "Annulla" per 5 secondi. */
export async function wearWithUndo(itemIds: string[], date: string, outfitId: string | null): Promise<boolean> {
  try {
    const snap = await wearItems(db, { itemIds, date, outfitId });
    void tapFeedback('medium');
    void syncReminder();
    showUndoToast(date === todayKey() ? 'Indossato oggi' : `Indossato il ${formatDateIt(date)}`, async () => {
      await undoWear(db, snap);
      await syncReminder();
    });
    return true;
  } catch (e) {
    reportError(e, 'Non sono riuscito a segnarlo come indossato.');
    return false;
  }
}

/** Chiude la giornata: i capi scelti vanno a lavare, con "Annulla". */
export async function closeDayWithUndo(washIds: string[], stainIds: string[]): Promise<boolean> {
  try {
    const snap = await applyEndOfDay(db, washIds, stainIds);
    void tapFeedback();
    void syncReminder();
    const n = snap.items.length;
    const text = n === 0 ? 'Giornata chiusa: tutto resta pulito' : n === 1 ? '1 capo → Da lavare' : `${n} capi → Da lavare`;
    showUndoToast(text, async () => {
      await undoEndOfDay(db, snap);
      await syncReminder();
    });
    return true;
  } catch (e) {
    reportError(e);
    return false;
  }
}
