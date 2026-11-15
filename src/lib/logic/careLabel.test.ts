import { describe, expect, it } from 'vitest';
import {
  compositionText,
  fabricsFor,
  hasFindings,
  parseBrand,
  parseFibers,
  parseSize,
  parseWash,
  readCareLabel,
  type OcrLine,
} from './careLabel';

const FABRIC_LIST = ['Cotone', 'Lino', 'Lana', 'Cashmere', 'Seta', 'Denim', 'Pelle', 'Camoscio', 'Viscosa', 'Sintetico'];

/** Righe con altezza: le scritte grandi hanno h alto. */
const lines = (...rows: [string, number?][]): OcrLine[] => {
  let y = 0;
  return rows.map(([text, h = 20]) => {
    const box = [10, y, 300, y + h] as const;
    y += h + 4;
    return { text, box };
  });
};

describe('parseFibers', () => {
  it('legge percentuali e fibre in più lingue, senza contare due volte le ripetizioni', () => {
    expect(parseFibers('95% COTTON / COTON / BAUMWOLLE | 5% ELASTANE / ELASTHANNE | 95% CO 5% EA')).toEqual([
      { name: 'cotone', percent: 95 },
      { name: 'elastan', percent: 5 },
    ]);
    expect(parseFibers('100% algodón')).toEqual([{ name: 'cotone', percent: 100 }]);
    expect(parseFibers('80% Lana vergine 20% Poliammide')).toEqual([
      { name: 'lana', percent: 80 },
      { name: 'poliammide', percent: 20 },
    ]);
  });

  it('capisce anche "COTONE 60% POLIESTERE 40%" (numero dopo la fibra)', () => {
    expect(parseFibers('COTONE 60% POLIESTERE 40%')).toEqual([
      { name: 'cotone', percent: 60 },
      { name: 'poliestere', percent: 40 },
    ]);
    expect(parseFibers('CO 52% / PES 48%')).toEqual([
      { name: 'cotone', percent: 52 },
      { name: 'poliestere', percent: 48 },
    ]);
  });

  it('prende il tessuto principale e non la fodera', () => {
    expect(parseFibers('100% LINO | FODERA: 100% POLIESTERE')).toEqual([{ name: 'lino', percent: 100 }]);
    expect(parseFibers('LINING 100% VISCOSE | SHELL 70% WOOL 30% POLYAMIDE')).toEqual([
      { name: 'lana', percent: 70 },
      { name: 'poliammide', percent: 30 },
    ]);
    expect(parseFibers('ESTERNO 100% POLIAMMIDE IMBOTTITURA 90% PIUMINO 10% PIUMA')).toEqual([{ name: 'poliammide', percent: 100 }]);
  });

  it('ignora numeri che non sono fibre e le parole non vicine al numero', () => {
    expect(parseFibers('MADE IN ITALY RN 52469 30°')).toEqual([]);
    expect(parseFibers('95% XYZ 5% ELASTAN')).toEqual([{ name: 'elastan', percent: 5 }]);
    expect(parseFibers('100%COTTON')).toEqual([{ name: 'cotone', percent: 100 }]);
  });
});

describe('composizione e tessuti', () => {
  it('scrive la composizione e mette tra i tessuti solo quelli dal 15% in su', () => {
    const fibers = parseFibers('92,5% cotone 7,5% elastan');
    expect(compositionText(fibers)).toBe('92,5% cotone, 7,5% elastan');
    expect(fabricsFor(fibers, FABRIC_LIST)).toEqual(['Cotone']);
    expect(compositionText([])).toBeNull();
  });

  it('usa i nomi della tua lista; le sintetiche diventano “Sintetico” se manca il loro nome', () => {
    const fibers = parseFibers('60% polyester 40% viscose');
    expect(fabricsFor(fibers, FABRIC_LIST)).toEqual(['Sintetico', 'Viscosa']);
    expect(fabricsFor(fibers, ['Poliestere'])).toEqual(['Poliestere', 'Viscosa']);
    expect(fabricsFor(parseFibers('70% acrylic 30% wool'), ['Lana'])).toEqual(['Acrilico', 'Lana']);
    // La fibra principale c'è sempre, anche sotto il 15% (non succede, ma non deve sparire).
    expect(fabricsFor([{ name: 'seta', percent: 10 }], FABRIC_LIST)).toEqual(['Seta']);
  });
});

describe('parseSize', () => {
  it('dopo la parola Taglia/Size/Talla', () => {
    expect(parseSize(['TAGLIA/SIZE: M'])).toBe('M');
    expect(parseSize(['Größe 38'])).toBe('38');
    expect(parseSize(['TALLA XL'])).toBe('XL');
  });

  it('con il paese: prima le lettere, poi IT, poi EU', () => {
    expect(parseSize(['EUR M  USA M  MEX 28'])).toBe('M');
    expect(parseSize(['FR 40', 'IT 44', 'US 8'])).toBe('IT 44');
    expect(parseSize(['EU 40 UK 6.5'])).toBe('EU 40');
  });

  it('jeans W e L, poi una taglia a lettere da sola su una riga', () => {
    expect(parseSize(['W32 L34'])).toBe('W32 L34');
    expect(parseSize(['W 30/L 32'])).toBe('W30 L32');
    expect(parseSize(['ZARA', 'S', 'MADE IN TURKEY'])).toBe('S');
  });

  it('non scambia percentuali o testo per una taglia', () => {
    expect(parseSize(['100% COTTON', 'MACHINE WASH COLD WITH LIKE COLORS'])).toBeNull();
    expect(parseSize(['E 100%'])).toBeNull();
  });
});

describe('parseWash', () => {
  it('legge le istruzioni scritte in più lingue', () => {
    expect(parseWash('LAVARE A MANO | NON CENTRIFUGARE | NON USARE ASCIUGATRICE')).toEqual(['handWash', 'noSpin', 'noDryer']);
    expect(parseWash('Machine wash 30°C gentle cycle. Do not tumble dry. Cool iron. Dry clean')).toEqual([
      'max30',
      'delicate',
      'noDryer',
      'ironLow',
      'dryClean',
    ]);
    expect(parseWash('Lavage en machine 40° | Ne pas sécher en tambour')).toEqual(['max40', 'noDryer']);
    expect(parseWash('wash cold')).toEqual(['max30']);
  });

  it('le frasi negative non contano', () => {
    expect(parseWash('Do not dry clean | Non lavare a secco | ne pas nettoyer à sec')).toEqual([]);
    expect(parseWash('60°')).toEqual([]);
  });

  it('la temperatura del ferro (3 cifre) non è quella del lavaggio', () => {
    expect(parseWash('iron 110° | wash 40°')).toEqual(['max40']);
  });
});

describe('parseBrand', () => {
  it('trova una marca nota o tua, la più grande se più d’una', () => {
    expect(parseBrand(lines(['ZARA', 40], ['M'], ['MADE IN MOROCCO']), [])).toEqual({ value: 'Zara', sure: true });
    expect(parseBrand(lines(['Emporio Armani', 40], ['100% cotone']), [])).toEqual({ value: 'Emporio Armani', sure: true });
    expect(parseBrand(lines(['BOTTEGA ROSSI', 40]), ['Bottega Rossi'])).toEqual({ value: 'Bottega Rossi', sure: true });
  });

  it('le marche corte o che sono parole comuni valgono solo da sole', () => {
    expect(parseBrand(lines(['H&M', 40], ['M']), [])).toEqual({ value: 'H&M', sure: true });
    expect(parseBrand(lines(['RN 12345 CA 67890'], ['DRY CLEAN ONLY'], ['100% WOOL']), [])).toBeNull();
    expect(parseBrand(lines(['ONLY', 40], ['S']), [])).toEqual({ value: 'Only', sure: true });
  });

  it('altrimenti propone la scritta più grande, senza esserne sicuro', () => {
    expect(parseBrand(lines(['Atelier Nove', 44], ['100% cotone'], ['Lavare a mano'], ['Made in Italy'], ['RN 1234']), [])).toEqual({
      value: 'Atelier Nove',
      sure: false,
    });
    // Tutte le scritte uguali: nessuna proposta.
    expect(parseBrand(lines(['Lorem ipsum'], ['Dolor sit'], ['Amet consectetur'], ['Adipiscing elit']), [])).toBeNull();
  });
});

describe('readCareLabel', () => {
  it('mette tutto insieme e dice se ha trovato qualcosa', () => {
    const r = readCareLabel(
      lines(['MANGO', 40], ['EUR M'], ['95% COTTON  5% ELASTANE'], ['LINING 100% POLYESTER'], ['WASH AT 30°'], ['DO NOT TUMBLE DRY']),
      [],
      FABRIC_LIST,
    );
    expect(r).toMatchObject({
      brand: { value: 'Mango', sure: true },
      size: 'M',
      composition: '95% cotone, 5% elastan',
      fabrics: ['Cotone'],
      washTags: ['max30', 'noDryer'],
    });
    expect(r.text.split('\n')).toHaveLength(6);
    expect(hasFindings(r)).toBe(true);
    expect(hasFindings(readCareLabel(lines(['xx']), [], FABRIC_LIST))).toBe(false);
    expect(readCareLabel([], [], FABRIC_LIST).text).toBe('');
  });
});
