import { emptyFilters, type ItemFilters, type ItemSort } from '../logic/items';

/** Ricerca, filtri e ordinamento dell'Armadio: restano uguali quando si cambia sezione. */
export const wardrobeView = $state<{ filters: ItemFilters; sort: ItemSort }>({
  filters: emptyFilters(),
  sort: 'recent',
});

export function resetWardrobeFilters(): void {
  const query = wardrobeView.filters.query;
  wardrobeView.filters = { ...emptyFilters(), query };
}
