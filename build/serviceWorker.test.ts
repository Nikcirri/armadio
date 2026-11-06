import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from './serviceWorker';

describe('service worker della versione web', () => {
  it('mette in cache tutti i file e ignora le richieste esterne', () => {
    const src = serviceWorkerSource(['./', './index.html', './assets/a.js'], 'armadio-abc');
    expect(src).toContain('const CACHE = "armadio-abc";');
    expect(src).toContain('const FILES = ["./","./index.html","./assets/a.js"];');
    expect(src).toContain('url.origin !== self.location.origin');
    // È JavaScript valido.
    expect(() => new Function(src)).not.toThrow();
  });
});
