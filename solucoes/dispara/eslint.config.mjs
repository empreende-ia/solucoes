import nextPlugin from '@next/eslint-plugin-next'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
      'tmp/**',
      'scripts/**',
      '.eslintrc.cjs',
      '.eslintignore',
      '**/*.backup.*',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  // Next.js rules (flat config)
  nextPlugin.configs['core-web-vitals'],

  // Enable TS/TSX parsing (without enforcing strict TS lint rules on the whole repo)
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Keep the lint lightweight; this repo currently contains many intentional anys/unuseds.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]
