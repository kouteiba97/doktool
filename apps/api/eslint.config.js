import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import architecture from './eslint/module-boundaries.js';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'src/generated/'] },

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // NestJS DI reads constructor parameter types at runtime (emitDecoratorMetadata), so injected
  // classes must stay value imports.
  {
    files: ['src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },

  // Tests assert on untyped JSON response bodies; `expect` checks their shape instead.
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },

  // Architecture rules (ADR-001, ADR-002).
  {
    files: ['src/**/*.ts'],
    plugins: { architecture },
    rules: {
      'architecture/module-boundaries': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aws-sdk/*'],
              message: 'Only the storage module talks to R2; depend on StorageService (ADR-002).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/storage/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
