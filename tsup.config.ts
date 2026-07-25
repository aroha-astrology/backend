import { defineConfig } from 'tsup';
import { resolve } from 'path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'ephemeris-worker': 'src/lib/astro-engine/calculations/ephemeris-worker.ts',
  },
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
