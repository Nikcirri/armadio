import type { SlotType } from '../db/types';

// Icone delle categorie (SPEC 4): emoji divise per gruppo, con un'etichetta per i lettori di schermo.
// Solo emoji fino alla versione 13, che i telefoni Android recenti mostrano tutte.

export interface CategoryIcon {
  emoji: string;
  label: string;
}

export interface CategoryIconGroup {
  id: string;
  label: string;
  /** Il gruppo va in cima quando si sceglie uno di questi tipi di capo. */
  slots: readonly SlotType[];
  icons: readonly CategoryIcon[];
}

export const CATEGORY_ICON_GROUPS: readonly CategoryIconGroup[] = [
  {
    id: 'tops',
    label: 'Sopra',
    slots: ['top_base', 'top_layer', 'outerwear'],
    icons: [
      { emoji: '👕', label: 'T-shirt' },
      { emoji: '👚', label: 'Top e bluse' },
      { emoji: '👔', label: 'Camicie' },
      { emoji: '🎽', label: 'Canotte' },
      { emoji: '🧶', label: 'Maglioni' },
      { emoji: '🧥', label: 'Giacche e cappotti' },
      { emoji: '🥼', label: 'Camici' },
      { emoji: '🦺', label: 'Gilet' },
    ],
  },
  {
    id: 'bottoms',
    label: 'Sotto e abiti',
    slots: ['bottom', 'full_body'],
    icons: [
      { emoji: '👖', label: 'Jeans e pantaloni' },
      { emoji: '🩳', label: 'Shorts' },
      { emoji: '👗', label: 'Abiti e gonne' },
      { emoji: '🥻', label: 'Abiti lunghi' },
      { emoji: '👘', label: 'Kimono e vestaglie' },
      { emoji: '🥋', label: 'Tute' },
    ],
  },
  {
    id: 'shoes',
    label: 'Scarpe',
    slots: ['shoes'],
    icons: [
      { emoji: '👟', label: 'Sneakers' },
      { emoji: '👞', label: 'Scarpe eleganti' },
      { emoji: '👠', label: 'Tacchi' },
      { emoji: '👡', label: 'Sandali con il tacco' },
      { emoji: '🥿', label: 'Ballerine e mocassini' },
      { emoji: '👢', label: 'Stivali' },
      { emoji: '🥾', label: 'Scarponcini' },
      { emoji: '🩴', label: 'Infradito' },
      { emoji: '🩰', label: 'Scarpe da danza' },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessori',
    slots: ['accessory'],
    icons: [
      { emoji: '👜', label: 'Borse' },
      { emoji: '👛', label: 'Pochette e portafogli' },
      { emoji: '👝', label: 'Clutch' },
      { emoji: '🎒', label: 'Zaini' },
      { emoji: '💼', label: 'Valigette' },
      { emoji: '🧳', label: 'Valigie' },
      { emoji: '🧣', label: 'Sciarpe' },
      { emoji: '🧤', label: 'Guanti' },
      { emoji: '🧢', label: 'Cappellini' },
      { emoji: '👒', label: 'Cappelli' },
      { emoji: '🎩', label: 'Cappelli eleganti' },
      { emoji: '🕶️', label: 'Occhiali da sole' },
      { emoji: '👓', label: 'Occhiali' },
      { emoji: '💍', label: 'Anelli' },
      { emoji: '📿', label: 'Collane' },
      { emoji: '💎', label: 'Gioielli' },
      { emoji: '⌚', label: 'Orologi' },
      { emoji: '🎀', label: 'Fiocchi e accessori per capelli' },
      { emoji: '➰', label: 'Cinture' },
      { emoji: '🌂', label: 'Ombrelli' },
    ],
  },
  {
    id: 'underwear',
    label: 'Intimo e notte',
    slots: ['underwear'],
    icons: [
      { emoji: '👙', label: 'Reggiseni' },
      { emoji: '🩲', label: 'Slip e boxer' },
      { emoji: '🧦', label: 'Calze e calzini' },
      { emoji: '🌙', label: 'Pigiami' },
      { emoji: '🛌', label: 'Da notte' },
    ],
  },
  {
    id: 'sport',
    label: 'Mare e sport',
    slots: [],
    icons: [
      { emoji: '🩱', label: 'Costumi interi e body' },
      { emoji: '🏖️', label: 'Mare' },
      { emoji: '🥽', label: 'Occhialini' },
      { emoji: '🏋️', label: 'Palestra' },
      { emoji: '🧘', label: 'Yoga' },
      { emoji: '🏃', label: 'Corsa' },
      { emoji: '🚴', label: 'Bici' },
      { emoji: '⛷️', label: 'Sci' },
      { emoji: '⚽', label: 'Calcio' },
      { emoji: '🎾', label: 'Tennis' },
    ],
  },
  {
    id: 'other',
    label: 'Altro',
    slots: [],
    icons: [
      { emoji: '❄️', label: 'Inverno' },
      { emoji: '☀️', label: 'Estate' },
      { emoji: '🌧️', label: 'Pioggia' },
      { emoji: '🎉', label: 'Feste' },
      { emoji: '🎭', label: 'Costumi di carnevale' },
      { emoji: '🏠', label: 'Casa' },
      { emoji: '👶', label: 'Bimbi' },
      { emoji: '🎁', label: 'Regali' },
      { emoji: '⭐', label: 'Preferiti' },
      { emoji: '❤️', label: 'Speciali' },
    ],
  },
];

export const ALL_CATEGORY_ICONS: readonly CategoryIcon[] = CATEGORY_ICON_GROUPS.flatMap((g) => g.icons);

/** I gruppi con quello del tipo di capo scelto in cima (gli altri nell'ordine solito). */
export function iconGroupsFor(slot: SlotType): CategoryIconGroup[] {
  const first = CATEGORY_ICON_GROUPS.filter((g) => g.slots.includes(slot));
  return [...first, ...CATEGORY_ICON_GROUPS.filter((g) => !g.slots.includes(slot))];
}

const DEFAULT_ICON: Record<SlotType, string> = {
  top_base: '👕',
  top_layer: '🧶',
  bottom: '👖',
  full_body: '👗',
  outerwear: '🧥',
  shoes: '👟',
  accessory: '👜',
  underwear: '🩲',
};

/** L'icona tipica di un tipo di capo, proposta nelle categorie nuove. */
export function defaultIconFor(slot: SlotType): string {
  return DEFAULT_ICON[slot];
}

export function iconLabel(emoji: string): string | null {
  return ALL_CATEGORY_ICONS.find((i) => i.emoji === emoji)?.label ?? null;
}
