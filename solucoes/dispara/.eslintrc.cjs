/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  plugins: ['react-hooks'],
  extends: ['next/core-web-vitals', 'next/typescript', 'plugin:react-hooks/recommended'],
}
