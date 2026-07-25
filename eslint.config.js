import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/db/migrations/**',
      // Plain-JS worker_threads fixtures/entries must run untranspiled — not
      // part of the tsconfig TS program (no allowJs), so typed-linting them
      // fails with a "project service" parse error rather than a real lint issue.
      'test/fixtures/**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    // The src/lib subsystem: ported Swiss Ephemeris math, Python-ported swarm
    // agents, and infra with loosely-typed external boundaries (Redis, fetch
    // Web Streams, FCM). tsc stays strict over all of it (0 errors); only
    // eslint's noisy type-safety rules are relaxed here, as for test files.
    files: ['src/lib/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-constant-binary-expression': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    // Hono route handlers are async by convention even when a given handler
    // has no await (e.g. stub/sync responses); require-await is noise here.
    files: ['**/*.routes.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  prettier,
);
