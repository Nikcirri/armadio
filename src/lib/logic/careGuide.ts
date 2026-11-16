import type { WashTag } from '../db/types';
import { normalize } from './careLabel';

// Guida macchie e lavaggio (SPEC.md, sezione 8.8): testi scritti nell'app, senza internet.
// Sono indicazioni generali: vale sempre l'etichetta del capo.

// ---------- Macchie ----------

export interface Stain {
  id: string;
  name: string;
  /** Parole con cui cercarla (oltre al nome). */
  also: string[];
  steps: string[];
  avoid: string[];
}

export const GOLDEN_RULES: readonly string[] = [
  'Agisci subito: una macchia fresca viene via molto più facilmente.',
  'Tampona, non strofinare: dall’esterno verso il centro, così la macchia non si allarga.',
  'Lavora dal rovescio del tessuto, con un panno bianco o della carta assorbente sotto.',
  'Sangue, uovo, latte e sudore vanno trattati con acqua fredda: il caldo li fissa.',
  'Prova ogni prodotto in un punto nascosto (cucitura interna, orlo).',
  'Niente asciugatrice né ferro finché la macchia non è sparita: il calore la fissa per sempre.',
  'Mai mescolare la candeggina con ammoniaca, aceto o altri prodotti: si formano gas tossici.',
];

/** Avviso per i tessuti delicati, uguale per tutte le macchie. */
export const DELICATE_NOTE =
  'Seta, lana, cashmere, pelle, camoscio e capi con scritto “solo lavaggio a secco”: tampona solo con acqua fredda (niente acqua su pelle e camoscio) e porta il capo in tintoria il prima possibile, dicendo che macchia è.';

export const STAINS: readonly Stain[] = [
  {
    id: 'vino',
    name: 'Vino rosso',
    also: ['vino', 'rosso', 'sangria', 'mirtillo'],
    steps: [
      'Tampona subito con carta assorbente per togliere più vino possibile.',
      'Sciacqua dal rovescio con acqua fredda corrente.',
      'Metti qualche goccia di detersivo per piatti o di sapone di Marsiglia, massaggia piano e lascia agire 10–15 minuti.',
      'Sciacqua. Se resta un alone su un capo bianco di cotone, usa uno smacchiatore all’ossigeno seguendo la confezione.',
      'Lava come dice l’etichetta e controlla prima di asciugare.',
    ],
    avoid: ['Acqua calda', 'Strofinare'],
  },
  {
    id: 'caffe',
    name: 'Caffè e tè',
    also: ['caffe', 'te', 'cappuccino', 'tisana'],
    steps: [
      'Tampona e sciacqua dal rovescio con acqua fredda.',
      'Massaggia con detersivo liquido per bucato o per piatti e lascia agire 10 minuti.',
      'Se c’era latte, trattala anche come una macchia di latte (solo acqua fredda).',
      'Lava come dice l’etichetta.',
    ],
    avoid: ['Acqua bollente', 'Asciugatrice prima che sia sparita'],
  },
  {
    id: 'olio',
    name: 'Olio e grasso',
    also: ['unto', 'burro', 'maionese', 'frittura', 'grasso', 'crema', 'olio'],
    steps: [
      'Non bagnare: copri la macchia con talco o amido di mais e lascia assorbire 15–30 minuti.',
      'Spazzola via la polvere.',
      'Metti detersivo per piatti sgrassante, massaggia piano con le dita e lascia agire 10 minuti.',
      'Lava alla temperatura più alta permessa dall’etichetta.',
    ],
    avoid: ['Acqua prima del talco', 'Asciugatrice se l’alone si vede ancora'],
  },
  {
    id: 'pomodoro',
    name: 'Sugo di pomodoro',
    also: ['sugo', 'pomodoro', 'ketchup', 'ragu', 'pizza'],
    steps: [
      'Togli i residui con un cucchiaio, senza schiacciarli.',
      'Sciacqua dal rovescio con acqua fredda.',
      'Detersivo per piatti, massaggia e lascia agire 10 minuti; se il sugo era grasso, prima il talco come per l’olio.',
      'Lava come dice l’etichetta; se resta un alone arancione, stendi il capo al sole: aiuta a schiarirlo.',
    ],
    avoid: ['Acqua calda all’inizio'],
  },
  {
    id: 'cioccolato',
    name: 'Cioccolato',
    also: ['cioccolata', 'nutella', 'cacao', 'gelato al cioccolato'],
    steps: [
      'Lascia indurire e togli i residui con un cucchiaio.',
      'Sciacqua dal rovescio con acqua fredda.',
      'Detersivo liquido per bucato, massaggia e lascia agire 15 minuti.',
      'Lava come dice l’etichetta.',
    ],
    avoid: ['Acqua calda', 'Ferro da stiro'],
  },
  {
    id: 'frutta',
    name: 'Frutta e succhi',
    also: ['succo', 'frutta', 'fragola', 'arancia', 'ciliegia', 'marmellata', 'smoothie'],
    steps: [
      'Sciacqua subito con acqua fredda dal rovescio.',
      'Massaggia con detersivo liquido per bucato e lascia agire 10 minuti.',
      'Sui capi bianchi, se resta un alone, smacchiatore all’ossigeno seguendo la confezione.',
      'Lava come dice l’etichetta.',
    ],
    avoid: ['Acqua calda', 'Asciugatrice prima che sia sparita'],
  },
  {
    id: 'uovo',
    name: 'Uovo, latte e gelato',
    also: ['uovo', 'latte', 'gelato', 'yogurt', 'formaggio', 'pappa', 'vomito'],
    steps: [
      'Togli i residui e sciacqua dal rovescio con acqua fredda.',
      'Detersivo per bucato con enzimi (quasi tutti i liquidi li hanno): massaggia e lascia agire 30 minuti.',
      'Lava in acqua fredda o tiepida, come permette l’etichetta.',
    ],
    avoid: ['Acqua calda: “cuoce” la macchia e la fissa'],
  },
  {
    id: 'sangue',
    name: 'Sangue',
    also: ['sangue', 'ferita', 'naso', 'ciclo'],
    steps: [
      'Sciacqua subito con acqua fredda corrente dal rovescio.',
      'Strofina piano con sapone di Marsiglia e lascia agire 15 minuti.',
      'Solo su cotone bianco, se resta un alone: un po’ di acqua ossigenata, poi sciacqua subito.',
      'Lava in acqua fredda.',
    ],
    avoid: ['Acqua calda', 'Acqua ossigenata sui colorati (scolora)'],
  },
  {
    id: 'sudore',
    name: 'Sudore e aloni gialli',
    also: ['sudore', 'ascelle', 'aloni', 'giallo', 'colletto'],
    steps: [
      'Fai una pasta di bicarbonato e poca acqua, stendila sull’alone e lascia agire 30 minuti.',
      'In alternativa: aceto bianco diluito metà con acqua, 15 minuti.',
      'Sciacqua e lava come dice l’etichetta.',
    ],
    avoid: ['Candeggina al cloro: rende gli aloni ancora più gialli', 'Bicarbonato e aceto insieme (si annullano)'],
  },
  {
    id: 'deodorante',
    name: 'Deodorante (aloni bianchi)',
    also: ['deodorante', 'antitraspirante', 'bianco', 'aloni bianchi'],
    steps: [
      'Se è fresco, strofina con un collant di nylon o un panno asciutto: spesso sparisce subito.',
      'Se resta: tampona con aceto bianco diluito metà con acqua.',
      'Lava come dice l’etichetta.',
    ],
    avoid: ['Ferro caldo sopra l’alone'],
  },
  {
    id: 'erba',
    name: 'Erba',
    also: ['erba', 'prato', 'verde', 'foglie'],
    steps: [
      'Massaggia con detersivo liquido con enzimi e lascia agire 30 minuti.',
      'Se resta (su tessuti resistenti, provando prima): tampona con alcol denaturato.',
      'Lava alla temperatura più alta permessa dall’etichetta.',
    ],
    avoid: ['Acqua calda prima del detersivo'],
  },
  {
    id: 'fango',
    name: 'Fango',
    also: ['fango', 'terra', 'polvere'],
    steps: [
      'Lascia asciugare del tutto: il fango bagnato si allarga.',
      'Spazzola via la terra secca.',
      'Massaggia con detersivo liquido, lascia agire 15 minuti e lava come dice l’etichetta.',
    ],
    avoid: ['Strofinare il fango bagnato'],
  },
  {
    id: 'fondotinta',
    name: 'Fondotinta e correttore',
    also: ['trucco', 'fondotinta', 'correttore', 'make up', 'cipria', 'colletto'],
    steps: [
      'Togli i residui con un dischetto asciutto.',
      'Tampona con acqua micellare o con detersivo per piatti.',
      'Sciacqua e lava come dice l’etichetta.',
    ],
    avoid: ['Strofinare: spinge il colore nelle fibre'],
  },
  {
    id: 'rossetto',
    name: 'Rossetto',
    also: ['trucco', 'rossetto', 'lucidalabbra', 'matita labbra', 'burrocacao'],
    steps: [
      'Togli i residui con il bordo di un cucchiaio.',
      'Tampona con alcol denaturato (provando prima) oppure con detersivo per piatti.',
      'Sciacqua, poi lava come dice l’etichetta.',
    ],
    avoid: ['Acqua calda all’inizio', 'Ferro da stiro'],
  },
  {
    id: 'mascara',
    name: 'Mascara ed eyeliner',
    also: ['trucco', 'mascara', 'eyeliner', 'matita occhi', 'ombretto'],
    steps: [
      'Tampona con detersivo per piatti e acqua fredda.',
      'Se è waterproof: prima un po’ di struccante bifasico, poi il detersivo per piatti.',
      'Sciacqua e lava come dice l’etichetta.',
    ],
    avoid: ['Strofinare'],
  },
  {
    id: 'inchiostro',
    name: 'Inchiostro di penna',
    also: ['penna', 'biro', 'inchiostro', 'pennarello'],
    steps: [
      'Metti un panno bianco sotto la macchia.',
      'Tampona con alcol denaturato o isopropilico, provando prima: cambia spesso il panno sotto, che assorbe l’inchiostro.',
      'Sciacqua, massaggia con sapone di Marsiglia e lava come dice l’etichetta.',
    ],
    avoid: ['Acqua prima dell’alcol (allarga la macchia)', 'Asciugatrice prima che sia sparita'],
  },
  {
    id: 'smalto',
    name: 'Smalto per unghie',
    also: ['smalto', 'unghie'],
    steps: [
      'Non spalmarlo: togli quello che puoi con un cucchiaio.',
      'Con un panno bianco sotto, tampona con acetone, provando prima in un punto nascosto.',
      'Sciacqua e lava come dice l’etichetta.',
    ],
    avoid: ['Acetone su acetato, triacetato e alcuni sintetici: li scioglie (guarda l’etichetta)'],
  },
  {
    id: 'cera',
    name: 'Cera di candela',
    also: ['cera', 'candela', 'paraffina'],
    steps: [
      'Lascia indurire la cera (anche 30 minuti in freezer, in un sacchetto) e grattala via piano.',
      'Se il tessuto si può stirare: carta assorbente sopra e sotto e ferro tiepido; la cera si scioglie nella carta (cambiala spesso).',
      'Se resta un alone colorato, tampona con alcol denaturato, poi lava come dice l’etichetta.',
    ],
    avoid: ['Ferro caldo appoggiato direttamente sulla cera'],
  },
  {
    id: 'gomma',
    name: 'Gomma da masticare',
    also: ['gomma', 'chewing gum', 'cicca'],
    steps: [
      'Metti il capo in un sacchetto in freezer per 1–2 ore.',
      'Quando la gomma è dura, staccala con le unghie o con un coltello senza punta.',
      'Togli i residui con detersivo per piatti e lava come dice l’etichetta.',
    ],
    avoid: ['Tirarla quando è morbida', 'Acqua calda'],
  },
  {
    id: 'ruggine',
    name: 'Ruggine',
    also: ['ruggine', 'ferro', 'arancione'],
    steps: [
      'Solo su capi bianchi o resistenti: succo di limone e un pizzico di sale sulla macchia.',
      'Lascia al sole un’ora, tenendo bagnato con il limone.',
      'Sciacqua e lava; sui colorati usa uno smacchiatore antiruggine seguendo la confezione.',
    ],
    avoid: ['Candeggina al cloro: fissa la ruggine'],
  },
];

/** Macchie che corrispondono alla ricerca (nome o parole simili), nell'ordine della guida. */
export function searchStains(query: string): Stain[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [...STAINS];
  return STAINS.filter((s) => {
    const hay = normalize([s.name, ...s.also].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

// ---------- Tessuti ----------

export interface FabricGuide {
  id: string;
  name: string;
  /** Pezzi di nome (tessuti dei capi e fibre) che portano a questa scheda. */
  match: string[];
  wash: string;
  dry: string;
  iron: string;
  keep: string;
}

export const FABRIC_GUIDES: readonly FabricGuide[] = [
  {
    id: 'cotone',
    name: 'Cotone',
    match: ['cotone', 'cotton', 'jersey', 'spugna', 'popeline', 'piquet'],
    wash: 'Colorati a 30–40°, bianchi resistenti fino a 60° se l’etichetta lo permette. Rovescia i capi stampati. Per i bianchi la candeggina all’ossigeno è più delicata di quella al cloro.',
    dry: 'All’aria è meglio; in asciugatrice può restringere: usa la temperatura bassa.',
    iron: 'Ferro caldo (3 punti), con il capo ancora leggermente umido.',
    keep: 'Piegato o appeso; le magliette meglio piegate, così non si deformano le spalle.',
  },
  {
    id: 'lino',
    name: 'Lino',
    match: ['lino', 'linen'],
    wash: '30–40°, centrifuga bassa: si stropiccia meno.',
    dry: 'Stendi subito, ben scosso. Niente asciugatrice: può restringere.',
    iron: 'Ferro caldo (3 punti) con il capo umido; i colori scuri dal rovescio. Qualche piega è normale: è il bello del lino.',
    keep: 'Appeso, in un posto asciutto.',
  },
  {
    id: 'lana',
    name: 'Lana',
    match: ['lana', 'wool', 'merino', 'alpaca', 'mohair', 'angora', 'tweed', 'loden'],
    wash: 'Spesso basta arieggiarla. Quando serve: programma lana o a mano in acqua fredda o tiepida (al massimo 30°), con detersivo per lana; acqua sempre alla stessa temperatura.',
    dry: 'Non strizzare né torcere: arrotolala in un asciugamano e premi. Asciuga in piano, lontano da termosifoni e sole. Mai asciugatrice: infeltrisce.',
    iron: 'Vapore a bassa temperatura (2 punti) con un panno in mezzo, senza premere.',
    keep: 'Piegata (le grucce la deformano), pulita, con lavanda o cedro contro le tarme.',
  },
  {
    id: 'cashmere',
    name: 'Cashmere',
    match: ['cashmere', 'cachemire', 'kashmir'],
    wash: 'Lavalo poco: a mano in acqua fredda con detersivo per lana, senza ammollo lungo.',
    dry: 'Arrotolato in un asciugamano per togliere l’acqua, poi in piano all’ombra. Mai asciugatrice.',
    iron: 'Meglio solo vapore, a distanza; se serve, ferro tiepido con un panno in mezzo.',
    keep: 'Piegato, con antitarme naturali. I pallini si tolgono con il pettine apposito, non con il rasoio.',
  },
  {
    id: 'seta',
    name: 'Seta',
    match: ['seta', 'silk', 'raso', 'satin', 'chiffon'],
    wash: 'Se l’etichetta dice solo lavaggio a secco: tintoria. Altrimenti a mano in acqua fredda con detersivo delicato, pochi minuti, senza torcere.',
    dry: 'Avvolta in un asciugamano per togliere l’acqua, poi stesa all’ombra. Niente asciugatrice.',
    iron: 'Dal rovescio, ferro tiepido (1 punto), con il capo ancora leggermente umido.',
    keep: 'Appesa su grucce morbide. Profumo e deodorante prima di vestirti, non sopra la seta.',
  },
  {
    id: 'viscosa',
    name: 'Viscosa e simili',
    match: ['viscosa', 'viscose', 'rayon', 'modal', 'lyocell', 'tencel', 'cupro', 'bamboo', 'bambu'],
    wash: 'È delicata da bagnata: 30° delicati o a mano, centrifuga bassa.',
    dry: 'Può restringere: niente asciugatrice. Stendila dandole la sua forma.',
    iron: 'Dal rovescio, temperatura media (2 punti).',
    keep: 'Appesa o piegata, come preferisci.',
  },
  {
    id: 'sintetico',
    name: 'Sintetici (poliestere, poliammide, acrilico)',
    match: ['sintetic', 'poliestere', 'polyester', 'poliammide', 'polyamide', 'nylon', 'acrilico', 'acrylic', 'acetato', 'pile', 'microfibra', 'ecopelle', 'poliuretano'],
    wash: '30–40°, al rovescio. Il pile senza ammorbidente. L’acrilico fa pallini: lavalo al rovescio e con altri capi delicati.',
    dry: 'Asciugano in fretta all’aria; l’asciugatrice crea pieghe ed elettricità statica.',
    iron: 'Ferro tiepido (1 punto): il calore li lucida o li scioglie. L’ecopelle non si stira.',
    keep: 'Appesi o piegati. L’ecopelle lontano dal calore, che la crepa.',
  },
  {
    id: 'elastan',
    name: 'Elasticizzati (elastan, lycra)',
    match: ['elastan', 'elastane', 'lycra', 'spandex', 'stretch', 'costum'],
    wash: 'Al massimo 30–40°, poco ammorbidente. I costumi: sciacquali subito dal cloro o dal sale.',
    dry: 'All’aria, mai asciugatrice e mai al sole forte: rovinano l’elasticità.',
    iron: 'Ferro tiepido (1 punto) o niente.',
    keep: 'Piegati, non tirati su grucce strette.',
  },
  {
    id: 'denim',
    name: 'Denim (jeans)',
    match: ['denim', 'jeans', 'jean'],
    wash: 'Lavali poco, al rovescio, con zip e bottoni chiusi, a 30°. I primi lavaggi da soli o con gli scuri: perdono colore.',
    dry: 'Appesi all’aria. L’asciugatrice li fa restringere e scolorire.',
    iron: 'Ferro caldo dal rovescio, se serve.',
    keep: 'Piegati o appesi per i passanti.',
  },
  {
    id: 'pelle',
    name: 'Pelle',
    match: ['pelle', 'leather', 'cuoio', 'nappa'],
    wash: 'Niente lavatrice e niente acqua. Spolvera con un panno morbido appena umido; ogni tanto una crema nutriente per pelle (prova prima).',
    dry: 'Se si bagna, lasciala asciugare a temperatura ambiente, lontano da termosifoni e phon.',
    iron: 'Non si stira.',
    keep: 'Su una gruccia larga, in una sacca traspirante (non di plastica). Macchie: tintoria specializzata.',
  },
  {
    id: 'camoscio',
    name: 'Camoscio e scamosciati',
    match: ['camoscio', 'scamosciat', 'suede', 'nabuk', 'nubuck'],
    wash: 'Niente acqua. Spazzola il pelo con la spazzola apposita, sempre nello stesso verso. Prima di usarlo, uno spray impermeabilizzante.',
    dry: 'Se si bagna, lascialo asciugare da solo, poi spazzola.',
    iron: 'Non si stira.',
    keep: 'In una sacca traspirante. Macchie asciutte: gomma per camoscio; grasso o macchie grandi: tintoria.',
  },
];

export const LAUNDRY_TIPS: readonly string[] = [
  'Dividi bianchi, colori chiari e scuri; i capi colorati nuovi, i primi lavaggi da soli.',
  'Svuota le tasche, chiudi zip e ganci, slaccia i bottoni delle camicie.',
  'Rovescia jeans, capi stampati e scuri: si scoloriscono meno.',
  'Delicati e reggiseni in un sacchetto a rete.',
  'Non riempire troppo il cestello: i capi devono potersi muovere.',
  'Dosa il detersivo come dice la confezione: di più non lava meglio, resta nei tessuti.',
  'Spesso 30° bastano: si risparmia energia e i colori durano di più.',
  'Stendi subito: meno pieghe e niente cattivi odori.',
];

/**
 * Le schede dei tessuti di un capo (in ordine, senza doppioni), riconosciute dal nome del tessuto
 * o della fibra: es. "Poliestere" → sintetici, "Lana merino" → lana.
 */
export function fabricGuidesFor(fabrics: readonly string[]): FabricGuide[] {
  const out: FabricGuide[] = [];
  for (const f of fabrics) {
    const n = normalize(f);
    const guide = FABRIC_GUIDES.find((g) => g.match.some((m) => n.includes(m)));
    if (guide && !out.includes(guide)) out.push(guide);
  }
  return out;
}

// ---------- Simboli ----------

export type SymbolBase = 'wash' | 'hand' | 'bleach' | 'bleachOxygen' | 'dryer' | 'dryFlat' | 'dryLine' | 'iron' | 'pro';

/** Come disegnare un simbolo (CareSymbol.svelte). */
export interface SymbolShape {
  base: SymbolBase;
  temp?: number;
  /** Punti: temperatura di asciugatrice o ferro. */
  dots?: number;
  /** Trattini sotto: programma delicato (1) o molto delicato (2). */
  bars?: number;
  letter?: string;
  crossed?: boolean;
}

export interface CareSymbol {
  id: string;
  shape: SymbolShape;
  title: string;
  meaning: string;
  /** L'etichetta di lavaggio dell'app che corrisponde, se c'è. */
  tag?: WashTag;
}

export interface SymbolGroup {
  title: string;
  intro: string;
  symbols: CareSymbol[];
}

export const SYMBOL_GROUPS: readonly SymbolGroup[] = [
  {
    title: 'Lavaggio',
    intro: 'La vaschetta: il numero è la temperatura massima, i trattini sotto chiedono un programma più delicato.',
    symbols: [
      { id: 'w30', shape: { base: 'wash', temp: 30 }, title: 'Lavare a 30°', meaning: 'In lavatrice, al massimo a 30°.', tag: 'max30' },
      { id: 'w40', shape: { base: 'wash', temp: 40 }, title: 'Lavare a 40°', meaning: 'In lavatrice, al massimo a 40°.', tag: 'max40' },
      { id: 'w60', shape: { base: 'wash', temp: 60 }, title: 'Lavare a 60°', meaning: 'In lavatrice, al massimo a 60° (capi resistenti).' },
      { id: 'w30d', shape: { base: 'wash', temp: 30, bars: 1 }, title: 'Delicato', meaning: 'Un trattino: programma delicato o sintetici, centrifuga ridotta.', tag: 'delicate' },
      { id: 'w30dd', shape: { base: 'wash', temp: 30, bars: 2 }, title: 'Molto delicato', meaning: 'Due trattini: programma lana o molto delicato.', tag: 'delicate' },
      { id: 'hand', shape: { base: 'hand' }, title: 'Lavare a mano', meaning: 'Solo a mano, in acqua tiepida (al massimo 40°), senza strizzare.', tag: 'handWash' },
      { id: 'nowash', shape: { base: 'wash', crossed: true }, title: 'Non lavare in acqua', meaning: 'Niente lavatrice né lavaggio a mano: di solito va in tintoria.' },
    ],
  },
  {
    title: 'Candeggina',
    intro: 'Il triangolo dice se puoi usare la candeggina o uno sbiancante.',
    symbols: [
      { id: 'bleach', shape: { base: 'bleach' }, title: 'Candeggina permessa', meaning: 'Va bene qualsiasi candeggina, anche al cloro.' },
      { id: 'bleachO', shape: { base: 'bleachOxygen' }, title: 'Solo senza cloro', meaning: 'Due righe: solo sbiancanti all’ossigeno (percarbonato), niente cloro.' },
      { id: 'nobleach', shape: { base: 'bleach', crossed: true }, title: 'Niente candeggina', meaning: 'Nessuno sbiancante.' },
    ],
  },
  {
    title: 'Asciugatura',
    intro: 'Il quadrato con il cerchio è l’asciugatrice; il quadrato con una riga è l’asciugatura all’aria.',
    symbols: [
      { id: 'dry2', shape: { base: 'dryer', dots: 2 }, title: 'Asciugatrice', meaning: 'Due punti: temperatura normale.' },
      { id: 'dry1', shape: { base: 'dryer', dots: 1 }, title: 'Asciugatrice a bassa temperatura', meaning: 'Un punto: programma delicato, temperatura bassa.' },
      { id: 'nodry', shape: { base: 'dryer', crossed: true }, title: 'Niente asciugatrice', meaning: 'Asciuga all’aria.', tag: 'noDryer' },
      { id: 'flat', shape: { base: 'dryFlat' }, title: 'Asciugare in piano', meaning: 'Steso su una superficie piana (lana, maglie): appeso si deforma.' },
      { id: 'line', shape: { base: 'dryLine' }, title: 'Asciugare appeso', meaning: 'Steso sul filo o su una gruccia.' },
    ],
  },
  {
    title: 'Stiro',
    intro: 'Il ferro: più punti, più caldo.',
    symbols: [
      { id: 'iron1', shape: { base: 'iron', dots: 1 }, title: 'Ferro tiepido', meaning: 'Un punto: al massimo 110°, meglio senza vapore (sintetici, seta).', tag: 'ironLow' },
      { id: 'iron2', shape: { base: 'iron', dots: 2 }, title: 'Ferro medio', meaning: 'Due punti: al massimo 150° (lana, viscosa, misti).' },
      { id: 'iron3', shape: { base: 'iron', dots: 3 }, title: 'Ferro caldo', meaning: 'Tre punti: al massimo 200° (cotone, lino).' },
      { id: 'noiron', shape: { base: 'iron', crossed: true }, title: 'Non stirare', meaning: 'Niente ferro né vapore.' },
    ],
  },
  {
    title: 'Lavaggio professionale',
    intro: 'Il cerchio è per la tintoria: la lettera dice quale lavaggio può fare.',
    symbols: [
      { id: 'proP', shape: { base: 'pro', letter: 'P' }, title: 'Lavaggio a secco', meaning: 'P: in tintoria con i solventi più comuni.', tag: 'dryClean' },
      { id: 'proF', shape: { base: 'pro', letter: 'F' }, title: 'Lavaggio a secco delicato', meaning: 'F: in tintoria, solo con solventi delicati.', tag: 'dryClean' },
      { id: 'proW', shape: { base: 'pro', letter: 'W' }, title: 'Lavaggio ad acqua professionale', meaning: 'W: la tintoria può lavarlo ad acqua con le sue macchine.' },
      { id: 'nopro', shape: { base: 'pro', crossed: true }, title: 'Niente lavaggio a secco', meaning: 'La tintoria non deve usare solventi.' },
    ],
  },
];
