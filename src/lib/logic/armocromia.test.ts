import { describe, expect, it } from 'vitest';
import { colorInfo, deltaE, GARMENT_COLORS, hexToLab } from './colors';
import {
  SEASONS,
  colorFit,
  describeMetrics,
  hueOf,
  isSeasonId,
  itemFit,
  manualProfile,
  measureFace,
  parseColorProfile,
  rankSeasons,
  seasonInfo,
  type FaceFeatures,
  type SeasonId,
} from './armocromia';

// Volti tipo (colori Lab misurati come farebbe l'app): pelle, capelli, occhi, labbra, sopracciglia.
const FACES: [string, FaceFeatures, SeasonId][] = [
  ['bionda cenere, pelle rosata, occhi azzurri', { skin: [72, 14, 12], hair: [62, 2, 10], eyes: [55, -3, -15], lips: [55, 30, 10], brows: [50, 3, 10] }, 'lightSummer'],
  ['capelli neri, pelle media fredda, occhi scuri', { skin: [55, 12, 11], hair: [15, 1, 1], eyes: [25, 5, 6], lips: [45, 28, 8], brows: [18, 1, 2] }, 'deepWinter'],
  ['biondo dorato, pelle chiara pesca, occhi azzurri', { skin: [73, 12, 19], hair: [64, 6, 26], eyes: [58, -5, -14], lips: [60, 30, 18], brows: [55, 6, 20] }, 'lightSpring'],
  ['capelli neri, pelle chiara fredda, occhi azzurri vivi', { skin: [70, 13, 11], hair: [14, 1, 0], eyes: [50, -5, -24], lips: [50, 34, 9], brows: [16, 1, 1] }, 'brightWinter'],
  ['castano cenere, pelle media rosata, occhi grigio-verdi', { skin: [62, 12, 13], hair: [38, 2, 7], eyes: [45, -2, 5], lips: [52, 22, 10], brows: [36, 2, 6] }, 'softSummer'],
  ['castano dorato chiaro, pelle neutra calda, occhi nocciola spenti', { skin: [64, 11, 18], hair: [42, 6, 16], eyes: [45, 4, 12], lips: [55, 22, 15], brows: [40, 5, 14] }, 'softAutumn'],
  ['castano scuro caldo, pelle olivastra, occhi marroni', { skin: [52, 11, 21], hair: [20, 5, 8], eyes: [28, 7, 11], lips: [45, 24, 16], brows: [22, 4, 7] }, 'deepAutumn'],
  ['rosso fragola, pelle dorata chiara, occhi verdi', { skin: [68, 11, 22], hair: [50, 22, 30], eyes: [48, -8, 14], lips: [58, 32, 22], brows: [45, 16, 24] }, 'warmSpring'],
  ['castano medio cenere, pelle chiara rosata, occhi blu-grigi', { skin: [66, 15, 11], hair: [40, 1, 4], eyes: [48, -2, -10], lips: [52, 30, 6], brows: [38, 1, 4] }, 'coolSummer'],
  ['castano scuro freddo, pelle chiara fredda, occhi marroni scuri', { skin: [64, 14, 10], hair: [20, 0, 0], eyes: [30, 4, 4], lips: [48, 32, 6], brows: [20, 0, 0] }, 'coolWinter'],
  ['castano scuro, pelle chiara calda, occhi verdi vivi', { skin: [68, 11, 20], hair: [22, 6, 9], eyes: [45, -14, 18], lips: [55, 34, 20], brows: [24, 5, 8] }, 'brightSpring'],
];

describe('armocromia: le 12 stagioni', () => {
  it('dati completi e coerenti', () => {
    expect(SEASONS).toHaveLength(12);
    expect(new Set(SEASONS.map((s) => s.id)).size).toBe(12);
    const judged = GARMENT_COLORS.map((c) => c.id).filter((c) => c !== 'metallic' && c !== 'silver' && c !== 'pattern');
    for (const s of SEASONS) {
      expect(s.best.length, s.id).toBeGreaterThanOrEqual(13);
      expect(s.neutrals.length, s.id).toBeGreaterThanOrEqual(5);
      expect(s.avoid.length, s.id).toBeGreaterThanOrEqual(6);
      for (const sw of [...s.best, ...s.neutrals, ...s.avoid]) expect(sw.hex, `${s.id} ${sw.name}`).toMatch(/^#[0-9A-F]{6}$/);
      expect(Object.keys(s.garments).sort()).toEqual([...judged].sort());
      // ogni stagione ha colori che valorizzano e colori da evitare
      expect(Object.values(s.garments).filter((f) => f === 'good').length, s.id).toBeGreaterThanOrEqual(4);
      expect(Object.values(s.garments).filter((f) => f === 'avoid').length, s.id).toBeGreaterThanOrEqual(2);
    }
    expect(isSeasonId('deepWinter')).toBe(true);
    expect(isSeasonId('inverno')).toBe(false);
    expect(seasonInfo('warmAutumn').name).toBe('Autunno caldo');
  });

  it.each(FACES)('%s → stagione giusta', (_name, face, season) => {
    expect(rankSeasons(measureFace(face))[0]!.season).toBe(season);
  });

  it('un autunno ramato di media profondità sta tra Autunno caldo e Primavera calda', () => {
    const r = rankSeasons(measureFace({ skin: [62, 12, 21], hair: [32, 18, 24], eyes: [35, 8, 16], lips: [50, 26, 18], brows: [32, 12, 16] }));
    expect(r.slice(0, 2).map((x) => x.season).sort()).toEqual(['warmAutumn', 'warmSpring']);
  });

  it('percentuali intere che sommano a 100, dalla più vicina', () => {
    const r = rankSeasons({ temperature: 0.1, value: 0, chroma: 0 });
    expect(r.reduce((a, b) => a + b.percent, 0)).toBe(100);
    for (let i = 1; i < r.length; i++) expect(r[i]!.distance).toBeGreaterThanOrEqual(r[i - 1]!.distance);
  });

  it('funziona anche con la sola pelle', () => {
    const m = measureFace({ skin: [70, 12, 22], hair: null, eyes: null, lips: null, brows: null });
    expect(m.temperature).toBeGreaterThan(0.3);
    expect(m.contrast).toBe(0);
    expect(rankSeasons(m)[0]!.season).toBeDefined();
  });

  it('descrive le misure a parole', () => {
    expect(describeMetrics({ temperature: 0.8, value: 0.5, chroma: -0.6, contrast: -0.5 })).toEqual({
      undertone: 'Caldo',
      depth: 'Chiara',
      clarity: 'Tenue (polverosa)',
      contrast: 'Basso',
    });
    expect(describeMetrics({ temperature: -0.3, value: 0, chroma: 0.5, contrast: 0.6 }).undertone).toBe('Neutro tendente al freddo');
    expect(hueOf([50, 0, 10])).toBe(90);
    expect(hueOf([50, 0, -10])).toBe(270);
  });

  it('giudica i colori dei capi; oro e argento seguono il metallo, la fantasia no', () => {
    expect(colorFit('warmAutumn', 'black')).toBe('avoid');
    expect(colorFit('deepWinter', 'black')).toBe('good');
    expect(colorFit('coolSummer', 'metallic')).toBe('avoid');
    expect(colorFit('coolSummer', 'silver')).toBe('good');
    expect(colorFit('warmAutumn', 'metallic')).toBe('good');
    expect(colorFit('warmAutumn', 'silver')).toBe('avoid');
    expect(colorFit('warmAutumn', 'pattern')).toBeNull();
    expect(itemFit('warmAutumn', ['pattern', 'olive'])).toBe('good');
    expect(itemFit('warmAutumn', ['metallic'])).toBe('good');
    expect(itemFit('warmAutumn', ['pattern'])).toBeNull();
    expect(itemFit('lightSummer', [])).toBeNull();
  });

  it('giudica anche i colori nuovi in modo coerente con le stagioni', () => {
    expect(colorFit('warmAutumn', 'camel')).toBe('good');
    expect(colorFit('coolWinter', 'camel')).toBe('avoid');
    expect(colorFit('brightWinter', 'fuchsia')).toBe('good');
    expect(colorFit('warmSpring', 'fuchsia')).toBe('avoid');
    expect(colorFit('softSummer', 'sage')).toBe('good');
    expect(colorFit('deepAutumn', 'teal')).toBe('good');
    expect(colorFit('lightSpring', 'charcoal')).toBe('avoid');
    expect(colorFit('lightSummer', 'lightBlue')).toBe('good');
    // Il giudizio dei colori nuovi non contraddice le sfumature della stagione: un colore "da evitare"
    // non è quasi uguale a una sfumatura consigliata, uno "che valorizza" non è quasi uguale a una da evitare.
    const fresh = ['charcoal', 'taupe', 'camel', 'khaki', 'chocolate', 'blue', 'lightBlue', 'turquoise', 'teal', 'sage', 'forest', 'mustard', 'coral', 'rust', 'fuchsia', 'lilac', 'plum'] as const;
    for (const s of SEASONS) {
      for (const c of fresh) {
        const lab = hexToLab(colorInfo(c).hex);
        const near = (list: readonly { hex: string }[]) => Math.min(...list.map((sw) => deltaE(lab, hexToLab(sw.hex))));
        const fit = colorFit(s.id, c);
        if (fit === 'avoid') expect(near([...s.best, ...s.neutrals]), `${s.id} ${c}`).toBeGreaterThan(3);
        if (fit === 'good') expect(near(s.avoid), `${s.id} ${c}`).toBeGreaterThan(3);
      }
    }
  });

  it('legge il profilo salvato tenendo solo i dati validi', () => {
    expect(parseColorProfile(null)).toBeNull();
    expect(parseColorProfile({ season: 'boh' })).toBeNull();
    const p = parseColorProfile({
      season: 'softSummer',
      source: 'photo',
      date: '2026-11-06T18:00:00.000Z',
      colors: { skin: '#e0b4a0', hair: '#5a3c28', eyes: 'blu', lips: null, brows: '#463228' },
      metrics: { temperature: -0.4, value: 3, chroma: -0.8, contrast: 'x' },
      ranking: [{ season: 'softSummer', percent: 61.4 }, { season: 'nope', percent: 3 }],
    });
    expect(p).toEqual({
      season: 'softSummer',
      source: 'photo',
      date: '2026-11-06T18:00:00.000Z',
      colors: { skin: '#E0B4A0', hair: '#5A3C28', eyes: null, lips: null, brows: '#463228' },
      metrics: { temperature: -0.4, value: 1, chroma: -0.8, contrast: 0 },
      ranking: [{ season: 'softSummer', percent: 61 }],
      useInGenerator: true,
    });
    expect(manualProfile('deepWinter', 'x', false)).toEqual({
      season: 'deepWinter',
      source: 'manual',
      date: 'x',
      colors: null,
      metrics: null,
      ranking: [],
      useInGenerator: false,
    });
  });
});
