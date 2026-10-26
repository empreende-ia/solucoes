import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM: recria __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Carrega variáveis de ambiente do .env.local (mesmo arquivo usado pelo Next.js)
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

// Verifica se a senha está configurada
if (!process.env.MASTER_PASSWORD && !process.env.TEST_PASSWORD) {
  console.warn('⚠️  MASTER_PASSWORD ou TEST_PASSWORD não encontrada no .env.local')
}

/**
 * Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 *
 * Estrutura de testes:
 * - tests/e2e/fixtures/ - Fixtures reutilizáveis (auth, test-data)
 * - tests/e2e/pages/ - Page Objects (LoginPage, CampaignsPage, etc.)
 * - tests/e2e/*.spec.ts - Arquivos de teste
 */
export default defineConfig({
  // Global setup - carrega .env.local antes dos testes
  globalSetup: './tests/e2e/global-setup.ts',

  // Directory where tests are located - isolado do Vitest
  testDir: './tests/e2e',

  // Timeout padrão para cada teste (30 segundos)
  timeout: 30000,

  // Timeout para expect assertions
  expect: {
    timeout: 5000,
  },

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'on-failure' }]],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'retain-on-failure',

    // Viewport padrão
    viewport: { width: 1280, height: 720 },

    // Ignorar erros HTTPS em dev
    ignoreHTTPSErrors: true,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport para testes responsivos
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
    // Uncomment to add more browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    // Silencia output do dev server em CI
    stdout: process.env.CI ? 'ignore' : 'pipe',
  },
})
