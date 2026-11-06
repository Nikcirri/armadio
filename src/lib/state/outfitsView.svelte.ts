import { emptyOutfitFilters, type OutfitFilters, type OutfitSort } from '../logic/outfits';

/** Filtri e ordinamento della libreria degli outfit: restano finché l'app è aperta. */
export const outfitsView = $state<{ filters: OutfitFilters; sort: OutfitSort }>({
  filters: emptyOutfitFilters(),
  sort: 'recent',
});

export function resetOutfitFilters(): void {
  outfitsView.filters = emptyOutfitFilters();
}
