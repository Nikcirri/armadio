import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { lazyComponent } from './lazy';

const Fake = (() => ({})) as unknown as Component<{ title: string }>;

describe('lazyComponent', () => {
  it('carica una volta sola, anche con richieste contemporanee', async () => {
    const importer = vi.fn(async () => ({ default: Fake }));
    const lazy = lazyComponent(importer);
    expect(lazy.current).toBeNull();
    const [a, b] = await Promise.all([lazy.load(), lazy.load()]);
    expect(a).toBe(Fake);
    expect(b).toBe(Fake);
    expect(lazy.current).toBe(Fake);
    await lazy.load();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('dopo un errore si può riprovare', async () => {
    const importer = vi
      .fn<() => Promise<{ default: Component<{ title: string }> }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: Fake });
    const lazy = lazyComponent(importer);
    await expect(lazy.load()).rejects.toThrow('Failed to fetch');
    expect(lazy.current).toBeNull();
    await expect(lazy.load()).resolves.toBe(Fake);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
