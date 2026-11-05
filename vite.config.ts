import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Percorsi relativi: servono sia all'APK sia alla futura versione web su GitHub Pages.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
