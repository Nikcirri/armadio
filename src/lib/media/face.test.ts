import { describe, expect, it } from 'vitest';
import { faceDetectionSupported, toGeometry } from './face';

describe('viso dal plugin nativo', () => {
  it('converte i punti e la scala', () => {
    const g = toGeometry(
      {
        bounds: { x: 10, y: 20, width: 100, height: 120 },
        angles: { x: 1, y: 2, z: 3 },
        contours: { leftEye: [1, 2, 3, 4, 5], face: [] },
      },
      2,
    );
    expect(g.bounds).toEqual({ x: 20, y: 40, width: 200, height: 240 });
    expect(g.contours.leftEye).toEqual([
      [2, 4],
      [6, 8],
    ]);
    expect(g.contours.face).toBeUndefined();
    expect(g.angles).toEqual({ x: 1, y: 2, z: 3 });
    expect(faceDetectionSupported()).toBe(false);
  });
});
