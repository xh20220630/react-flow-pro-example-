import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '.next/**',
    '**/dist/**',
    'artifacts/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['src/**/*.{ts,tsx}', 'next.config.ts', 'playwright.config.ts', 'tests/**/*.ts'],
    extends: [...nextVitals, ...nextTs],
  },
  {
    files: ['packages/**/*.{ts,tsx,js,jsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        { patterns: ['@dlab/*', '**/vendor/**', '**/recovery/**', '**/artifacts/**'] },
      ],
    },
  },
  {
    files: ['*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
