import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

// Service worker della versione web (SPEC.md, sezione 2): dopo il build elenca tutti i file
// di dist/ e scrive dist/sw.js, che li tiene in cache per usare l'app senza internet.
// Nell'app Android il file c'è ma non viene registrato.

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

export function serviceWorkerSource(files: string[], cacheName: string): string {
  return `// Generato al build: non modificare.
const CACHE = ${JSON.stringify(cacheName)};
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('armadio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo i file dell'app: il controllo aggiornamenti verso GitHub passa sempre dalla rete.
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { ignoreVary: true }).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;
}

export function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'armadio-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const all = listFiles(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((p) => p !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const p of all) hash.update(p).update(readFileSync(join(outDir, p)));
      const files = ['./', ...all.map((p) => `./${p}`)];
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(files, `armadio-${hash.digest('hex').slice(0, 12)}`));
    },
  };
}
