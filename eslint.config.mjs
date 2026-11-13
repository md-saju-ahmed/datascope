import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{mjs,cjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.module.ts'],
    // Nest discovers decorated module classes even when they have no members.
    rules: {
      '@typescript-eslint/no-extraneous-class': [
        'error',
        { allowWithDecorator: true },
      ],
    },
  },
);
