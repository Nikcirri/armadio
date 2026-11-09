import { describe, expect, it } from 'vitest';
import { u8ToBase64 } from './bytes';

describe('u8ToBase64', () => {
  it('codifica pochi byte come btoa', () => {
    expect(u8ToBase64(new Uint8Array([]))).toBe('');
    expect(u8ToBase64(new TextEncoder().encode('Armadio'))).toBe(btoa('Armadio'));
    expect(u8ToBase64(new Uint8Array([0, 255, 128, 7]))).toBe('AP+ABw==');
  });

  it('funziona oltre un blocco (più di 32 KB) senza perdere byte', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 123);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const decoded = Uint8Array.from(atob(u8ToBase64(bytes)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});
