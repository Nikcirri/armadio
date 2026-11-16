import type { ColorId } from '../db/types';
import type { CategoryGuess } from '../logic/categoryGuess';
import type { Img } from '../logic/imageOps';

export interface ShopSnapshot {
  img: Img | null;
  categoryId: string;
  categoryTouched: boolean;
  colors: ColorId[];
  detected: ColorId[];
  colorsTouched: boolean;
  guess: CategoryGuess | null;
  name: string;
  price: string;
  store: string;
}

/**
 * Il capo della modalità negozio (SPEC.md, sezione 8.5). Vive fuori dalla pagina così,
 * se si passa a un'altra sezione e si torna, la foto e le scelte restano finché non si chiude la pagina.
 */
class ShopSession {
  /** Senza proxy: la foto va passata così com'è al worker e al salvataggio. */
  img = $state.raw<Img | null>(null);
  categoryId = $state('');
  categoryTouched = $state(false);
  colors = $state<ColorId[]>([]);
  detected = $state<ColorId[]>([]);
  colorsTouched = $state(false);
  guess = $state.raw<CategoryGuess | null>(null);
  name = $state('');
  price = $state('');
  store = $state('');
  /** Aumenta a ogni foto: i risultati di un'analisi vecchia si scartano. */
  run = 0;

  /** Nuova foto dello stesso capo (dopo l'editor): ricalcola colori e categoria proposti, tiene le scelte fatte a mano. */
  setPhoto(img: Img): number {
    this.img = img;
    this.detected = [];
    this.guess = null;
    this.run += 1;
    return this.run;
  }

  /** Copia di tutto, per "Annulla" dopo aver scartato il capo. */
  snapshot(): ShopSnapshot {
    return {
      img: this.img,
      categoryId: this.categoryId,
      categoryTouched: this.categoryTouched,
      colors: [...this.colors],
      detected: [...this.detected],
      colorsTouched: this.colorsTouched,
      guess: this.guess,
      name: this.name,
      price: this.price,
      store: this.store,
    };
  }

  restore(snap: ShopSnapshot): void {
    this.run += 1;
    this.img = snap.img;
    this.categoryId = snap.categoryId;
    this.categoryTouched = snap.categoryTouched;
    this.colors = [...snap.colors];
    this.detected = [...snap.detected];
    this.colorsTouched = snap.colorsTouched;
    this.guess = snap.guess;
    this.name = snap.name;
    this.price = snap.price;
    this.store = snap.store;
  }

  /** Un capo nuovo: si riparte da zero. */
  reset(): void {
    this.img = null;
    this.categoryId = '';
    this.categoryTouched = false;
    this.colors = [];
    this.detected = [];
    this.colorsTouched = false;
    this.guess = null;
    this.name = '';
    this.price = '';
    this.store = '';
    this.run += 1;
  }
}

export const shop = new ShopSession();
