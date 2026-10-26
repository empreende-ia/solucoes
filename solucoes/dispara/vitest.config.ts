import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Carrega variáveis de ambiente para testes
config({ path: '.env.local' });
config({ path: '.env.test.local' });

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.next/**',
            '**/e2e/**',
            '**/tests/e2e/**', // Testes E2E do Playwright
            // Pastas com repositórios/clones usados para referência (não fazem parte do produto)
            '**/tmp/gh/**',
            // Testes/artefatos gerados (não são fonte de verdade do produto)
            '**/tmp/tests/**',
        ],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
