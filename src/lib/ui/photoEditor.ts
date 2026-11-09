import { lazyComponent } from '../lazy';

/** L'editor foto si carica alla prima foto da modificare (SPEC.md, sezione 7). Condiviso da Armadio e Wishlist. */
export const photoEditor = lazyComponent(() => import('./PhotoEditor.svelte'));
