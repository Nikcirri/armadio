import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { serviceWorker } from './build/serviceWorker.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [svelte(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Percorsi relativi: servono sia all'APK sia alla versione web su GitHub Pages.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    rolldownOptions: {
      output: {
        // Tutto il codice che serve all'avvio in un solo file (meno richieste); le pagine caricate
        // a richiesta (SPEC.md, sezione 7) restano in file separati.
        codeSplitting: {
          groups: [{ name: 'app', tags: ['$initial'] }],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
  },
});
