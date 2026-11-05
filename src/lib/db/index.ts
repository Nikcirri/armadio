import { ArmadioDB } from './schema';
import { ChangeTracker } from './changes';

/** Database dell'app (uno solo per tutta l'app). */
export const db = new ArmadioDB();

/** Conta le modifiche per il promemoria backup. */
export const tracker = new ChangeTracker(db);
