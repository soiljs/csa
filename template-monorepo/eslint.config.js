import jseslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default tseslint.config(
  jseslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: 'demo',
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      semi: 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  { ignores: ['**/node_modules/**', '.git/', 'pnpm-lock.yaml', '**/dist/**'] },
  eslintPluginPrettierRecommended,
)
