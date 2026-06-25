import { defineConfig } from 'tsup';
import { resolve } from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  minify: false,
  dts: false,
  external: ['swisseph-wasm'],
  esbuildOptions(options) {
    options.alias = {
      '@aroha-astrology/shared': resolve('src/lib/shared/index.ts'),
    };
  },
});
