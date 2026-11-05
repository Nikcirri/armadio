import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
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
