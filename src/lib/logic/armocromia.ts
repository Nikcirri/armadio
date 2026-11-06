import type { ColorId, ColorProfile, SeasonId } from '../db/types';
import type { Lab } from './colors';

export type { SeasonId };

// Armocromia (SPEC.md, sezione 8.6): 12 stagioni, misure del viso e valutazione dei colori.

export type SeasonFamily = 'spring' | 'summer' | 'autumn' | 'winter';

/** Come sta un colore vicino al viso. */
export type Fit = 'good' | 'ok' | 'avoid';

/** Colori dei capi giudicabili (oro/argento e fantasia no). */
export type JudgedColor = Exclude<ColorId, 'metallic' | 'pattern'>;

export interface Swatch {
  name: string;
  hex: string;
}

/** Le quattro misure, tra -1 e 1. */
export interface ColorMetrics {
  /** Sottotono: caldo (+) o freddo (-). */
  temperature: number;
  /** Intensità: chiara (+) o profonda (-). */
  value: number;
  /** Brillantezza: brillante (+) o tenue (-). */
  chroma: number;
  /** Contrasto tra capelli, occhi e pelle: alto (+) o basso (-). */
  contrast: number;
}

export interface SeasonInfo {
  id: SeasonId;
  name: string;
  /** Nome internazionale, per chi lo cerca online. */
  english: string;
  family: SeasonFamily;
  description: string;
  /** Punto ideale della stagione (temperatura, intensità, brillantezza). */
  prototype: { temperature: number; value: number; chroma: number };
  best: readonly Swatch[];
  neutrals: readonly Swatch[];
  avoid: readonly Swatch[];
  metal: 'gold' | 'silver' | 'both';
  garments: Readonly<Record<JudgedColor, Fit>>;
}

const g = (name: string, hex: string): Swatch => ({ name, hex });

export const SEASONS: readonly SeasonInfo[] = [
  {
    id: 'lightSpring',
    name: 'Primavera chiara',
    english: 'Light Spring',
    family: 'spring',
    description: 'Colori chiari, caldi e luminosi, come una mattina di primavera: pesca, corallo chiaro, menta e azzurro cielo.',
    prototype: { temperature: 0.4, value: 0.9, chroma: 0 },
    best: [
      g('Pesca', '#F7B79A'),
      g('Albicocca', '#F8C08A'),
      g('Corallo chiaro', '#F58B7E'),
      g('Rosa salmone', '#F6A28E'),
      g('Rosa caldo', '#F28FA0'),
      g('Giallo burro', '#F6DF8C'),
      g('Verde menta', '#A6DDB6'),
      g('Verde mela', '#B4D76A'),
      g('Acquamarina', '#8FD7CC'),
      g('Turchese chiaro', '#5FC7C0'),
      g('Azzurro cielo', '#8FC6EB'),
      g('Pervinca', '#9CA9E2'),
      g('Lilla', '#C6A6D8'),
      g('Cammello chiaro', '#D7B48A'),
    ],
    neutrals: [g('Avorio', '#F8F1E1'), g('Panna', '#F2E6CC'), g('Beige chiaro', '#E6D3B3'), g('Grigio caldo chiaro', '#CFC6B8'), g('Blu navy chiaro', '#4A5F8C')],
    avoid: [g('Nero', '#1C1C1E'), g('Bianco ottico', '#FFFFFF'), g('Bordeaux', '#6D1F2F'), g('Marrone scuro', '#4A3020'), g('Antracite', '#3C3F44'), g('Oliva scuro', '#5A5A2E')],
    metal: 'gold',
    garments: {
      black: 'avoid', white: 'ok', cream: 'good', grey: 'ok', navy: 'ok', denim: 'good', green: 'good', olive: 'avoid',
      red: 'ok', burgundy: 'avoid', pink: 'good', yellow: 'good', orange: 'good', purple: 'ok', brown: 'ok',
    },
  },
  {
    id: 'warmSpring',
    name: 'Primavera calda',
    english: 'Warm Spring',
    family: 'spring',
    description: 'Colori caldi, dorati e vivaci: giallo oro, mandarino, corallo, verde prato e turchese.',
    prototype: { temperature: 0.9, value: 0.4, chroma: 0.1 },
    best: [
      g('Giallo oro', '#F2C230'),
      g('Mandarino', '#F28A30'),
      g('Corallo', '#F26B5B'),
      g('Rosso pomodoro', '#E5442F'),
      g('Pesca', '#F7A77E'),
      g('Rosa corallo', '#F47C7C'),
      g('Verde prato', '#6DBE45'),
      g('Verde lime', '#B2D235'),
      g('Verde giada', '#2FA37E'),
      g('Turchese', '#20B2AA'),
      g('Acqua', '#4FC1C9'),
      g('Blu fiordaliso', '#4F86C6'),
      g('Violetto caldo', '#8E6AC6'),
      g('Marrone dorato', '#A0703A'),
    ],
    neutrals: [g('Avorio', '#F8EED8'), g('Panna', '#F1E2C2'), g('Beige dorato', '#DDBF8F'), g('Cammello', '#C89D6A'), g('Blu navy caldo', '#2E4A7A')],
    avoid: [g('Nero', '#1C1C1E'), g('Bianco ottico', '#FFFFFF'), g('Grigio freddo', '#8A9099'), g('Rosa ghiaccio', '#F0D4E0'), g('Bordeaux', '#6D1F2F'), g('Fucsia', '#D1307F')],
    metal: 'gold',
    garments: {
      black: 'avoid', white: 'ok', cream: 'good', grey: 'avoid', navy: 'ok', denim: 'ok', green: 'good', olive: 'ok',
      red: 'good', burgundy: 'avoid', pink: 'ok', yellow: 'good', orange: 'good', purple: 'ok', brown: 'good',
    },
  },
  {
    id: 'brightSpring',
    name: 'Primavera brillante',
    english: 'Bright Spring',
    family: 'spring',
    description: 'Colori puri, accesi e un po’ caldi, con molto contrasto: rosso papavero, corallo acceso, smeraldo e turchese.',
    prototype: { temperature: 0.4, value: 0.1, chroma: 0.9 },
    best: [
      g('Rosso papavero', '#E8342E'),
      g('Corallo acceso', '#FF5F57'),
      g('Rosa acceso', '#F2477F'),
      g('Arancio vivo', '#FF7F27'),
      g('Giallo sole', '#FFD12E'),
      g('Verde smeraldo', '#00A86B'),
      g('Verde erba', '#43B649'),
      g('Turchese brillante', '#00B7C3'),
      g('Acqua vivace', '#2CD3C6'),
      g('Blu reale', '#2B6CD6'),
      g('Blu navy brillante', '#1F3A7A'),
      g('Viola', '#7A4BD1'),
      g('Fucsia caldo', '#E0337A'),
    ],
    neutrals: [g('Bianco caldo', '#FBF7EE'), g('Panna', '#F3E7CB'), g('Grigio caldo', '#8F8A84'), g('Blu navy', '#1F3570'), g('Cammello', '#C99A62')],
    avoid: [g('Malva spento', '#B497A6'), g('Grigio talpa', '#9A8F86'), g('Oliva spento', '#7A7550'), g('Beige spento', '#C8B9A4'), g('Marrone fangoso', '#6E5A48'), g('Rosa polvere', '#D7C4C9')],
    metal: 'gold',
    garments: {
      black: 'ok', white: 'good', cream: 'ok', grey: 'ok', navy: 'good', denim: 'good', green: 'good', olive: 'avoid',
      red: 'good', burgundy: 'ok', pink: 'good', yellow: 'good', orange: 'good', purple: 'good', brown: 'avoid',
    },
  },
  {
    id: 'lightSummer',
    name: 'Estate chiara',
    english: 'Light Summer',
    family: 'summer',
    description: 'Colori chiari, freschi e delicati: azzurro polvere, lavanda, rosa confetto e verde menta.',
    prototype: { temperature: -0.5, value: 0.9, chroma: -0.1 },
    best: [
      g('Azzurro polvere', '#A9C6E8'),
      g('Celeste', '#9CC7E8'),
      g('Pervinca', '#9EA6DC'),
      g('Blu fiordaliso', '#7F9BD4'),
      g('Lavanda', '#B9A8DA'),
      g('Lilla', '#C7A6D1'),
      g('Malva chiaro', '#C69DB3'),
      g('Rosa confetto', '#F3B6C8'),
      g('Rosa antico chiaro', '#E7A8B6'),
      g('Rosa lampone chiaro', '#E28AA7'),
      g('Verde menta fredda', '#A9D9C7'),
      g('Verde acqua', '#8CCBC1'),
      g('Salvia chiaro', '#B6CBB8'),
      g('Giallo limone pallido', '#F4EEA2'),
    ],
    neutrals: [g('Bianco morbido', '#F7F5F2'), g('Grigio perla', '#C8CCD2'), g('Grigio tortora', '#B9B1AD'), g('Beige rosato', '#DCCAC0'), g('Blu navy chiaro', '#4D6185')],
    avoid: [g('Nero', '#1C1C1E'), g('Arancio', '#E57A2E'), g('Senape', '#C9A227'), g('Marrone scuro', '#4A3020'), g('Verde oliva', '#6B6B35'), g('Rosso mattone', '#A2412E')],
    metal: 'silver',
    garments: {
      black: 'avoid', white: 'good', cream: 'ok', grey: 'good', navy: 'ok', denim: 'good', green: 'ok', olive: 'avoid',
      red: 'ok', burgundy: 'avoid', pink: 'good', yellow: 'ok', orange: 'avoid', purple: 'good', brown: 'avoid',
    },
  },
  {
    id: 'coolSummer',
    name: 'Estate fredda',
    english: 'Cool Summer',
    family: 'summer',
    description: 'Colori freschi e morbidi, né troppo chiari né troppo scuri: rosa lampone, blu acciaio, prugna e grigio.',
    prototype: { temperature: -0.9, value: 0.2, chroma: -0.3 },
    best: [
      g('Rosa lampone', '#C8487A'),
      g('Rosa fragola', '#E06A92'),
      g('Rosa medio', '#E58FAE'),
      g('Rosso anguria', '#D84B5E'),
      g('Lampone', '#B03A63'),
      g('Prugna', '#7E4A73'),
      g('Malva', '#A8789A'),
      g('Lavanda', '#A497CF'),
      g('Blu acciaio', '#4F6E98'),
      g('Blu ardesia', '#6C7FA3'),
      g('Azzurro polvere', '#8FB2D6'),
      g('Denim', '#4E6FA0'),
      g('Verde acqua freddo', '#5CA8A0'),
      g('Verde pino', '#3F7469'),
    ],
    neutrals: [g('Bianco morbido', '#F5F4F1'), g('Grigio freddo', '#A3A8B0'), g('Grigio ardesia', '#6B7280'), g('Grigio rosato', '#A8979A'), g('Blu navy', '#2C3B5E')],
    avoid: [g('Arancio', '#E57A2E'), g('Giallo oro', '#E8B923'), g('Cammello', '#C19A6B'), g('Verde oliva', '#6B6B35'), g('Marrone dorato', '#9C6B3A'), g('Nero', '#1C1C1E')],
    metal: 'silver',
    garments: {
      black: 'avoid', white: 'ok', cream: 'avoid', grey: 'good', navy: 'good', denim: 'good', green: 'ok', olive: 'avoid',
      red: 'ok', burgundy: 'ok', pink: 'good', yellow: 'avoid', orange: 'avoid', purple: 'good', brown: 'avoid',
    },
  },
  {
    id: 'softSummer',
    name: 'Estate tenue',
    english: 'Soft Summer',
    family: 'summer',
    description: 'Colori polverosi e freschi, come velati di grigio: rosa antico, malva, salvia e blu ardesia.',
    prototype: { temperature: -0.4, value: 0, chroma: -0.9 },
    best: [
      g('Rosa antico', '#C99AA2'),
      g('Rosa polvere', '#D7A7B0'),
      g('Malva', '#A88796'),
      g('Lampone spento', '#A35C78'),
      g('Prugna polverosa', '#7B5C70'),
      g('Lavanda grigia', '#9C93B5'),
      g('Blu ardesia', '#6D7F9A'),
      g('Blu polvere', '#8EA4BD'),
      g('Denim spento', '#5E7891'),
      g('Verde salvia', '#93A792'),
      g('Verde acqua spento', '#7FA39B'),
      g('Petrolio spento', '#4F7C7D'),
      g('Grigio blu', '#7E8A98'),
      g('Verde grigio', '#8A9A8A'),
    ],
    neutrals: [g('Bianco sporco', '#EEEBE6'), g('Grigio tortora', '#A79E99'), g('Grigio medio', '#8C8D91'), g('Carbone morbido', '#545659'), g('Blu navy grigio', '#3E4B63')],
    avoid: [g('Nero', '#1C1C1E'), g('Bianco ottico', '#FFFFFF'), g('Arancio vivo', '#FF7F27'), g('Giallo acceso', '#FFD12E'), g('Rosso fuoco', '#E3122C'), g('Fucsia', '#E1307E')],
    metal: 'silver',
    garments: {
      black: 'avoid', white: 'ok', cream: 'ok', grey: 'good', navy: 'good', denim: 'good', green: 'good', olive: 'ok',
      red: 'avoid', burgundy: 'ok', pink: 'good', yellow: 'avoid', orange: 'avoid', purple: 'good', brown: 'ok',
    },
  },
  {
    id: 'softAutumn',
    name: 'Autunno tenue',
    english: 'Soft Autumn',
    family: 'autumn',
    description: 'Colori morbidi e caldi, come sfumati: salvia, cammello, terracotta delicata e verde acqua spento.',
    prototype: { temperature: 0.4, value: 0, chroma: -0.9 },
    best: [
      g('Salvia', '#9CAF88'),
      g('Verde muschio', '#7B8B5A'),
      g('Oliva chiaro', '#8E8C5A'),
      g('Kaki', '#A99A72'),
      g('Cammello', '#C19A6B'),
      g('Terracotta morbida', '#C27C5E'),
      g('Salmone spento', '#D99A82'),
      g('Pesca polverosa', '#E0AE8E'),
      g('Rosa antico caldo', '#C98F84'),
      g('Senape morbida', '#C9A85A'),
      g('Teal morbido', '#5E8C86'),
      g('Verde acqua spento', '#7BA59A'),
      g('Petrolio spento', '#4E6E74'),
      g('Cioccolato al latte', '#8B6A4F'),
    ],
    neutrals: [g('Panna', '#EEE2C8'), g('Beige', '#D8C3A5'), g('Grigio talpa caldo', '#A8998A'), g('Fungo', '#9E8C7A'), g('Marrone caffè', '#6B5240')],
    avoid: [g('Nero', '#1C1C1E'), g('Bianco ottico', '#FFFFFF'), g('Fucsia', '#E1307E'), g('Blu elettrico', '#1F4FE0'), g('Rosa ghiaccio', '#F0D4E0'), g('Viola acceso', '#7B2FD1')],
    metal: 'gold',
    garments: {
      black: 'avoid', white: 'avoid', cream: 'good', grey: 'ok', navy: 'ok', denim: 'ok', green: 'good', olive: 'good',
      red: 'ok', burgundy: 'ok', pink: 'ok', yellow: 'ok', orange: 'ok', purple: 'avoid', brown: 'good',
    },
  },
  {
    id: 'warmAutumn',
    name: 'Autunno caldo',
    english: 'Warm Autumn',
    family: 'autumn',
    description: 'Colori caldi e ricchi, della terra e delle spezie: ruggine, zucca, senape, oliva e cioccolato.',
    prototype: { temperature: 0.9, value: -0.35, chroma: -0.3 },
    best: [
      g('Ruggine', '#B5532A'),
      g('Zucca', '#D9762B'),
      g('Terracotta', '#C0603E'),
      g('Rosso mattone', '#9C3D2A'),
      g('Rosso pomodoro', '#C8402E'),
      g('Senape', '#C99A2E'),
      g('Oro antico', '#B8913A'),
      g('Verde oliva', '#6E6B2E'),
      g('Verde muschio', '#5C6B32'),
      g('Verde bosco', '#3F5E3A'),
      g('Petrolio', '#2F5F63'),
      g('Turchese scuro', '#2C7A73'),
      g('Cammello', '#B98A55'),
      g('Cioccolato', '#5A3A22'),
    ],
    neutrals: [g('Panna', '#F0E2C4'), g('Beige dorato', '#D5B88A'), g('Cammello', '#B88A56'), g('Kaki', '#8E8458'), g('Marrone caffè', '#6A4A30')],
    avoid: [g('Nero', '#1C1C1E'), g('Bianco ottico', '#FFFFFF'), g('Grigio freddo', '#8A9099'), g('Rosa confetto', '#F3B6C8'), g('Fucsia', '#E1307E'), g('Blu ghiaccio', '#CFE3F0')],
    metal: 'gold',
    garments: {
      black: 'avoid', white: 'avoid', cream: 'good', grey: 'avoid', navy: 'ok', denim: 'ok', green: 'good', olive: 'good',
      red: 'good', burgundy: 'ok', pink: 'avoid', yellow: 'good', orange: 'good', purple: 'avoid', brown: 'good',
    },
  },
  {
    id: 'deepAutumn',
    name: 'Autunno profondo',
    english: 'Deep Autumn',
    family: 'autumn',
    description: 'Colori scuri, caldi e intensi: cioccolato, bordeaux caldo, verde bosco, petrolio e ruggine.',
    prototype: { temperature: 0.5, value: -0.9, chroma: -0.1 },
    best: [
      g('Bordeaux caldo', '#6E2430'),
      g('Rosso mattone', '#8E2F23'),
      g('Ruggine', '#A2482A'),
      g('Rame', '#A65A2E'),
      g('Zucca scura', '#B5571E'),
      g('Senape scura', '#A27B1E'),
      g('Oro antico', '#A8873A'),
      g('Verde bosco', '#2E4A33'),
      g('Oliva scuro', '#4F4F24'),
      g('Smeraldo scuro', '#1D5E45'),
      g('Petrolio scuro', '#1F4A4D'),
      g('Teal profondo', '#135E5E'),
      g('Melanzana', '#4E2A40'),
      g('Prugna', '#5B2C45'),
    ],
    neutrals: [g('Panna', '#EADBC0'), g('Cammello scuro', '#9C7444'), g('Marrone caffè', '#5C4033'), g('Cioccolato fondente', '#4A2E1F'), g('Carbone caldo', '#3F3A36')],
    avoid: [g('Rosa confetto', '#F3B6C8'), g('Azzurro polvere', '#A9C6E8'), g('Lavanda', '#B9A8DA'), g('Grigio chiaro freddo', '#D3D6DB'), g('Bianco ottico', '#FFFFFF'), g('Giallo limone', '#F4E04D')],
    metal: 'gold',
    garments: {
      black: 'ok', white: 'avoid', cream: 'good', grey: 'ok', navy: 'ok', denim: 'ok', green: 'good', olive: 'good',
      red: 'good', burgundy: 'good', pink: 'avoid', yellow: 'ok', orange: 'good', purple: 'ok', brown: 'good',
    },
  },
  {
    id: 'deepWinter',
    name: 'Inverno profondo',
    english: 'Deep Winter',
    family: 'winter',
    description: 'Colori scuri, freddi e decisi, con molto contrasto: nero, bordeaux, smeraldo, zaffiro e bianco ottico.',
    prototype: { temperature: -0.5, value: -0.9, chroma: 0.1 },
    best: [
      g('Bordeaux', '#6A1B2D'),
      g('Rosso ciliegia', '#A3132F'),
      g('Rosso vero', '#C8102E'),
      g('Fucsia profondo', '#A3175F'),
      g('Prugna', '#5A1846'),
      g('Viola scuro', '#4B1F5E'),
      g('Blu zaffiro', '#0F3D91'),
      g('Blu reale', '#1F3FA8'),
      g('Verde smeraldo', '#00704A'),
      g('Verde pino', '#0B4F3C'),
      g('Teal profondo', '#005F66'),
      g('Bianco ottico', '#FFFFFF'),
      g('Nero', '#111111'),
    ],
    neutrals: [g('Nero', '#111111'), g('Bianco ottico', '#FFFFFF'), g('Antracite', '#33363C'), g('Grigio freddo', '#7F848C'), g('Blu navy', '#16213B')],
    avoid: [g('Pesca', '#F7B79A'), g('Arancio', '#E57A2E'), g('Cammello', '#C19A6B'), g('Beige dorato', '#DDBF8F'), g('Oliva chiaro', '#8E8C5A'), g('Senape', '#C9A227')],
    metal: 'silver',
    garments: {
      black: 'good', white: 'good', cream: 'avoid', grey: 'good', navy: 'good', denim: 'ok', green: 'good', olive: 'avoid',
      red: 'good', burgundy: 'good', pink: 'ok', yellow: 'avoid', orange: 'avoid', purple: 'good', brown: 'avoid',
    },
  },
  {
    id: 'coolWinter',
    name: 'Inverno freddo',
    english: 'Cool Winter',
    family: 'winter',
    description: 'Colori freddi, puri e ghiacciati: rosso blu, fucsia, blu reale, smeraldo, nero e bianco.',
    prototype: { temperature: -0.9, value: -0.2, chroma: 0.3 },
    best: [
      g('Rosso blu', '#C8102E'),
      g('Lampone', '#B3125B'),
      g('Fucsia', '#D1176E'),
      g('Magenta', '#B5179E'),
      g('Rosa ghiaccio', '#F2D7E5'),
      g('Viola reale', '#5B2A86'),
      g('Prugna fredda', '#6B2D5C'),
      g('Blu reale', '#1E3FAE'),
      g('Blu cobalto', '#0047AB'),
      g('Blu ghiaccio', '#D4E6F4'),
      g('Turchese freddo', '#00A3AD'),
      g('Verde smeraldo', '#009B77'),
      g('Verde pino', '#01665E'),
    ],
    neutrals: [g('Nero', '#111111'), g('Bianco ottico', '#FFFFFF'), g('Grigio perla freddo', '#D3D6DB'), g('Grigio freddo', '#9AA0A8'), g('Antracite', '#3B3F46'), g('Blu navy', '#1A2B4F')],
    avoid: [g('Arancio', '#E57A2E'), g('Cammello', '#C19A6B'), g('Giallo oro', '#E8B923'), g('Verde oliva', '#6B6B35'), g('Marrone dorato', '#9C6B3A'), g('Pesca', '#F7B79A')],
    metal: 'silver',
    garments: {
      black: 'good', white: 'good', cream: 'avoid', grey: 'good', navy: 'good', denim: 'good', green: 'ok', olive: 'avoid',
      red: 'good', burgundy: 'good', pink: 'good', yellow: 'avoid', orange: 'avoid', purple: 'good', brown: 'avoid',
    },
  },
  {
    id: 'brightWinter',
    name: 'Inverno brillante',
    english: 'Bright Winter',
    family: 'winter',
    description: 'Colori freddi e accesissimi, con il massimo contrasto: rosa shocking, blu elettrico, smeraldo, nero e bianco.',
    prototype: { temperature: -0.4, value: -0.1, chroma: 0.9 },
    best: [
      g('Rosa shocking', '#FF1493'),
      g('Fucsia', '#E0218A'),
      g('Magenta', '#C2008E'),
      g('Rosso vivo', '#E3122C'),
      g('Viola elettrico', '#8A2BE2'),
      g('Blu elettrico', '#1F51FF'),
      g('Blu cobalto', '#0047AB'),
      g('Blu navy brillante', '#102A6B'),
      g('Turchese acceso', '#00C5CD'),
      g('Verde smeraldo', '#00A86B'),
      g('Verde menta acceso', '#3EE0A1'),
      g('Giallo limone', '#FFF44F'),
      g('Rosa ghiaccio', '#F7D6E6'),
      g('Blu ghiaccio', '#D6ECFA'),
    ],
    neutrals: [g('Nero', '#111111'), g('Bianco ottico', '#FFFFFF'), g('Grigio ghiaccio', '#E3E6EA'), g('Grigio freddo', '#8E949C'), g('Antracite', '#36393F'), g('Blu navy', '#13224A')],
    avoid: [g('Cammello', '#C19A6B'), g('Kaki', '#9C8F62'), g('Senape spento', '#B08D3A'), g('Malva spento', '#B497A6'), g('Beige spento', '#C8B9A4'), g('Marrone fangoso', '#6E5A48')],
    metal: 'silver',
    garments: {
      black: 'good', white: 'good', cream: 'avoid', grey: 'ok', navy: 'good', denim: 'good', green: 'good', olive: 'avoid',
      red: 'good', burgundy: 'ok', pink: 'good', yellow: 'ok', orange: 'avoid', purple: 'good', brown: 'avoid',
    },
  },
];

export const FAMILY_LABEL: Record<SeasonFamily, string> = {
  spring: 'Primavera',
  summer: 'Estate',
  autumn: 'Autunno',
  winter: 'Inverno',
};

export const METAL_LABEL: Record<SeasonInfo['metal'], string> = {
  gold: 'Oro (anche rame e bronzo)',
  silver: 'Argento (anche oro bianco e platino)',
  both: 'Oro e argento',
};

export function seasonInfo(id: SeasonId): SeasonInfo {
  return SEASONS.find((s) => s.id === id) ?? SEASONS[0]!;
}

export function isSeasonId(v: unknown): v is SeasonId {
  return typeof v === 'string' && SEASONS.some((s) => s.id === v);
}

// ---------- Misure del viso ----------

/** I colori misurati sul viso (Lab). Solo la pelle è indispensabile. */
export interface FaceFeatures {
  skin: Lab;
  hair: Lab | null;
  eyes: Lab | null;
  lips: Lab | null;
  brows: Lab | null;
}

const clamp = (n: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, n));

export function chromaOf(lab: Lab): number {
  return Math.hypot(lab[1], lab[2]);
}

/** Tinta in gradi (0-360): 0 rosso-rosa, 60 giallo-arancio, 90 giallo, 180 verde-azzurro, 270 blu. */
export function hueOf(lab: Lab): number {
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

/** Media pesata che ignora i termini mancanti. */
function weighted(terms: readonly (readonly [number | null, number])[]): number {
  let sum = 0;
  let w = 0;
  for (const [v, weight] of terms) {
    if (v === null || weight <= 0) continue;
    sum += v * weight;
    w += weight;
  }
  return w > 0 ? sum / w : 0;
}

/** Calore dei capelli: dorati, ramati e castani caldi (+), cenere e neri bluastri (-). */
function hairWarmth(hair: Lab): number {
  const c = chromaOf(hair);
  const h = hueOf(hair);
  if (h >= 15 && h <= 95) return clamp((c - 9) / 10);
  return -clamp(c / 10, 0, 1) * 0.6;
}

/** Calore degli occhi: azzurri e grigi freddi, nocciola e ambra caldi, marrone scuro neutri. */
function eyeWarmth(eyes: Lab): number {
  const c = chromaOf(eyes);
  const h = hueOf(eyes);
  if (c < 4) return -0.2;
  if (h > 170 && h < 320) return -0.7;
  if (h >= 95 && h <= 170) return 0.15;
  if (h >= 25 && h < 95) return clamp((c - 8) / 12, -0.2, 0.7);
  return 0;
}

/** Le quattro misure (SPEC 8.6). */
export function measureFace(f: FaceFeatures): ColorMetrics {
  const skinHue = hueOf(f.skin);
  const hairDepthWeight = f.hair ? clamp((f.hair[0] - 12) / 20, 0, 1) : 0;
  const lipsHue = f.lips ? hueOf(f.lips) : null;
  const temperature = clamp(
    weighted([
      [clamp((skinHue - 55) / 12), 0.55],
      [f.hair ? hairWarmth(f.hair) : null, 0.2 * hairDepthWeight],
      [f.eyes ? eyeWarmth(f.eyes) : null, 0.15],
      [lipsHue === null ? null : clamp(((lipsHue > 180 ? lipsHue - 360 : lipsHue) - 22) / 12), 0.1],
    ]),
  );
  const darkFeature = f.hair ?? f.brows;
  const value = clamp(
    weighted([
      [darkFeature ? clamp((darkFeature[0] - 38) / 22) : null, 0.5],
      [clamp((f.skin[0] - 60) / 14), 0.35],
      [f.eyes ? clamp((f.eyes[0] - 38) / 18) : null, 0.15],
    ]),
  );
  const rawContrast = weighted([
    [darkFeature ? Math.abs(darkFeature[0] - f.skin[0]) : null, 0.7],
    [f.eyes ? Math.abs(f.eyes[0] - f.skin[0]) : null, 0.3],
  ]);
  const contrast = darkFeature || f.eyes ? clamp((rawContrast - 28) / 18) : 0;
  // Brillantezza: contrasto e limpidezza degli occhi. Il colore della pelle no: una pelle dorata
  // ha più croma di una rosata senza essere più "brillante".
  const chroma = clamp(
    weighted([
      [darkFeature || f.eyes ? contrast : null, 0.6],
      [f.eyes ? clamp((chromaOf(f.eyes) - 15) / 10) : null, 0.4],
    ]),
  );
  return { temperature, value, chroma, contrast };
}

export interface SeasonScore {
  season: SeasonId;
  /** Percentuale di somiglianza (la somma fa 100). */
  percent: number;
  distance: number;
}

/** Stagioni dalla più vicina alla più lontana (il sottotono pesa un po' di più). */
export function rankSeasons(m: Pick<ColorMetrics, 'temperature' | 'value' | 'chroma'>): SeasonScore[] {
  const scored = SEASONS.map((s) => {
    const d2 =
      1.3 * (m.temperature - s.prototype.temperature) ** 2 + (m.value - s.prototype.value) ** 2 + (m.chroma - s.prototype.chroma) ** 2;
    return { season: s.id, d2 };
  });
  const weights = scored.map((x) => Math.exp(-x.d2 / 0.35));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out = scored.map((x, i) => ({ season: x.season, distance: Math.sqrt(x.d2), percent: (weights[i]! / total) * 100 }));
  out.sort((a, b) => a.distance - b.distance);
  // Percentuali intere che sommano a 100.
  const floors = out.map((x) => Math.floor(x.percent));
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = out.map((x, i) => [x.percent - floors[i]!, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest -= 1;
  }
  return out.map((x, i) => ({ ...x, percent: floors[i]!, distance: Math.round(x.distance * 1000) / 1000 }));
}

export interface MetricLabels {
  undertone: string;
  depth: string;
  clarity: string;
  contrast: string;
}

/** Le misure a parole. */
export function describeMetrics(m: ColorMetrics): MetricLabels {
  const t = m.temperature;
  const undertone = t > 0.45 ? 'Caldo' : t > 0.15 ? 'Neutro tendente al caldo' : t >= -0.15 ? 'Neutro' : t >= -0.45 ? 'Neutro tendente al freddo' : 'Freddo';
  const depth = m.value > 0.35 ? 'Chiara' : m.value < -0.35 ? 'Profonda' : 'Media';
  const clarity = m.chroma > 0.35 ? 'Brillante' : m.chroma < -0.35 ? 'Tenue (polverosa)' : 'Media';
  const contrast = m.contrast > 0.35 ? 'Alto' : m.contrast < -0.35 ? 'Basso' : 'Medio';
  return { undertone, depth, clarity, contrast };
}

// ---------- Colori dei capi ----------

/** Come sta un colore dei capi alla stagione (null per oro/argento e fantasia). */
export function colorFit(season: SeasonId, color: ColorId): Fit | null {
  if (color === 'metallic' || color === 'pattern') return null;
  return seasonInfo(season).garments[color];
}

/** Come sta un capo: conta il primo colore giudicabile (quello principale). */
export function itemFit(season: SeasonId, colors: readonly ColorId[]): Fit | null {
  for (const c of colors) {
    const fit = colorFit(season, c);
    if (fit) return fit;
  }
  return null;
}

export const FIT_LABEL: Record<Fit, string> = {
  good: 'Ti valorizza',
  ok: 'Va bene',
  avoid: 'Da evitare vicino al viso',
};

// ---------- Profilo salvato ----------

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
const hexOrNull = (v: unknown): string | null => (isHex(v) ? v.toUpperCase() : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : 0);

/** Profilo letto dalle impostazioni o da un backup: tiene solo i dati validi (null se non è valido). */
export function parseColorProfile(v: unknown): ColorProfile | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (!isSeasonId(r.season)) return null;
  const c = r.colors as Record<string, unknown> | null | undefined;
  const m = r.metrics as Record<string, unknown> | null | undefined;
  const ranking = Array.isArray(r.ranking)
    ? (r.ranking as { season?: unknown; percent?: unknown }[])
        .filter((x) => isSeasonId(x?.season) && typeof x.percent === 'number')
        .map((x) => ({ season: x.season as SeasonId, percent: Math.round(Math.min(100, Math.max(0, x.percent as number))) }))
    : [];
  return {
    season: r.season,
    source: r.source === 'manual' ? 'manual' : 'photo',
    date: typeof r.date === 'string' ? r.date : new Date(0).toISOString(),
    colors:
      c && isHex(c.skin)
        ? { skin: c.skin.toUpperCase(), hair: hexOrNull(c.hair), eyes: hexOrNull(c.eyes), lips: hexOrNull(c.lips), brows: hexOrNull(c.brows) }
        : null,
    metrics: m && typeof m === 'object' ? { temperature: num(m.temperature), value: num(m.value), chroma: num(m.chroma), contrast: num(m.contrast) } : null,
    ranking,
    useInGenerator: r.useInGenerator !== false,
  };
}

/** Profilo scelto a mano ("Conosco già la mia stagione"). */
export function manualProfile(season: SeasonId, now: string, useInGenerator = true): ColorProfile {
  return { season, source: 'manual', date: now, colors: null, metrics: null, ranking: [], useInGenerator };
}
