import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import refresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'output/**', '.playwright-cli/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  // Playwright CLI consumes these files as function expressions, not ES modules.
  { files: ['scripts/browser-*.js'], rules: { '@typescript-eslint/no-unused-expressions': 'off' } },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: { ...hooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
  },
)
