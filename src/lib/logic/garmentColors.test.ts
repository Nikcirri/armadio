import { describe, expect, it } from 'vitest';
import { createImg, type Img } from './imageOps';
import { detectGarmentColors } from './garmentColors';

function photo(bg: [number, number, number], fg: [number, number, number]): Img {
  const img = createImg(80, 100, [...bg, 255]);
  for (let y = 25; y < 80; y++)
    for (let x = 20; x < 60; x++) img.data.set([...fg, 255], (y * 80 + x) * 4);
  return img;
}

describe('colori del capo su foto non scontornata', () => {
  it('ignora lo sfondo bianco', () => {
    expect(detectGarmentColors(photo([246, 246, 243], [25, 25, 28]))).toEqual(['black']);
    expect(detectGarmentColors(photo([246, 246, 243], [200, 35, 40]))).toEqual(['red']);
  });
  it('ignora uno sfondo beige', () => {
    expect(detectGarmentColors(photo([240, 232, 220], [60, 90, 130]))).toEqual(['denim']);
  });
  it('se il capo riempie tutta la foto usa la foto intera', () => {
    expect(detectGarmentColors(createImg(50, 50, [30, 45, 90, 255]))).toEqual(['navy']);
  });
});
