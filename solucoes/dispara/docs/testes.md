# Testes

## O que existe hoje

| Suíte | Estado |
| --- | --- |
| **Unitários (Vitest)** | 171 arquivos de teste, rodando |
| **E2E (Playwright)** | Configurado, **sem nenhum `.spec.ts`** no repositório |
| **CI (GitHub Actions)** | `tsc --noEmit` + testes unitários + checagem das migrações a cada push/PR em `main` |

Distribuição dos testes unitários:

| Pasta | Arquivos |
| --- | --- |
| `lib/` | 112 |
| `app/` (rotas de API) | 18 |
| `services/` | 17 |
| `hooks/` | 13 |
| `components/` | 8 |
| `tests/` | 2 |
| `proxy.test.ts` | 1 |

A cobertura está concentrada na lógica de negócio (`lib/`) e na camada de serviços — onde
um erro silencioso custa dinheiro: formatação de telefone, contrato de template, mapeamento
de erro da Meta, contadores de campanha, supressão automática, condições de workflow.

Dois testes merecem destaque por serem **tripwires**, não verificações comuns:

- `proxy.test.ts` cobre a barreira de autenticação inteira — cada política, cada principal.
- `lib/route-policy.test.ts` guarda um **snapshot** das exceções de política. Abrir uma
  rota nova sem atualizar o snapshot quebra o build de propósito.
- `lib/realtime-db-change.contract.test.ts` garante que todo filtro de `REALTIME_FILTERS`
  usa coluna presente em `new` **e** `old` do payload.

## Rodando

```bash
npm run test           # todos os unitários
npm run test:watch     # watch
npm run test:ui        # dashboard do Vitest
npm run test:coverage  # cobertura
npm run db:check       # aplica as migrações num Postgres 17 (PGlite) e verifica

vitest run path/to/file.test.ts   # um arquivo
vitest run -t "nome do teste"     # um teste por nome
```

Playwright (hoje não encontra nada para rodar):

```bash
npm run test:e2e         # headless (chromium + mobile)
npm run test:e2e:ui      # UI interativa
npm run test:e2e:headed  # navegador visível
```

## Convenções

- `*.test.ts` / `*.test.tsx` → Vitest, ao lado do arquivo testado.
- `*.spec.ts` em `tests/e2e/` → Playwright.
- Ambiente `jsdom`, globals ligados, alias `@` → raiz.
- `vitest.config.ts` carrega `.env.local` e `.env.test.local`, e exclui `tests/e2e/`,
  `tmp/gh/` e `tmp/tests/`.

## Helpers

Em `tests/helpers/`:

| Arquivo | Para quê |
| --- | --- |
| `factories.ts` | Fábricas de entidades (campanha, contato, template) |
| `supabase-mock.ts` · `db-mock.ts` | Mock do client e do banco |
| `fetch-mock.ts` · `msw/` | Mock de HTTP (inclusive Cloud API) |
| `api-test-utils.ts` | Chamar API routes em teste |
| `hook-test-utils.tsx` | Renderizar hooks com React Query |
| `seed.ts` · `e2e-cleanup.ts` | Semear e limpar dados |

## Playwright

`playwright.config.ts` está pronto: carrega `.env.local`, avisa se falta
`MASTER_PASSWORD`/`TEST_PASSWORD`, sobe o dev server sozinho e roda em chromium + viewport
mobile. A estrutura prevista:

```
tests/e2e/fixtures/   # fixtures (auth, test-data)
tests/e2e/pages/      # page objects (LoginPage, CampaignsPage, ...)
tests/e2e/*.spec.ts   # os testes
```

Falta escrever os specs. Os fluxos que mais pedem cobertura E2E, na ordem:

1. Login → criar campanha → precheck → enviar (o caminho que gera receita).
2. Importar CSV de contatos e segmentar.
3. Receber mensagem no webhook → agente responde → handoff para o inbox.
4. Wizard de instalação (hoje só testável manualmente).

## Harness de migrações

`npm run db:check` (`scripts/check-migrations.mjs`) sobe um Postgres 17 em processo via
PGlite, aplica todas as migrações em ordem e verifica o resultado: triggers, disparo real
de broadcast, RPCs e privilégios. Tem modo `--verify-only`, somente leitura, que avisa
quando a janela de verificação venceu.

É o que impede uma migração nova de reabrir o acesso anônimo sem ninguém notar.

## CI

`.github/workflows/test.yml`, em push e PR para `main`:

```
Node 20 → npm install → tsc --noEmit → npm test -- --run → npm run db:check
```

E2E não roda no CI por decisão explícita (comentário no workflow: rodar local antes do
deploy). Como não há specs, isso é teórico por enquanto.

## Scripts de npm quebrados

Estes comandos estão em `package.json` mas apontam para arquivos que **não existem** no
repositório:

| Script | Arquivo que falta |
| --- | --- |
| `dev:tunnel` · `dev:tunnel:ai` | `scripts/dev-with-tunnel.mjs` |
| `whatsapp:context` | `scripts/build-whatsapp-context.ts` |
| `schema:parity` | `scripts/schema-parity-check.ts` |
| `schema:baseline:generate` | `scripts/generate-baseline-from-fullchain.ts` |
| `builder:smoke` | `scripts/builder-smoke.ts` |
| `db:migrate:0018` · `db:migrate:0020` | `scripts/apply-migration-pg.mjs` |
| `logs:follow:prod` | `scripts/vercel-logs-follow.mjs` |
| `monitor:all` | `scripts/monitor-all.mjs` |
| `test:stress` · `test:stress:local` · `test:stress:prod` | `tests/stress/run-stress-test.ts` |
| `test:e2e:whatsapp` · `:watch` | `tests/e2e-whatsapp/scenarios/` |
| `test:ai:api` · `:watch` | `tests/api-ai/scenarios/` |

`scripts/` contém `check-migrations.mjs` e `meta-audit.mjs`. Três deles
(`logs:follow:prod`, `monitor:all`, `test:stress:prod`) ainda têm `YOUR_VERCEL_URL` literal
como argumento.

Os scripts que **funcionam**: `dev`, `dev:ai`, `ai:devtools`, `build`, `start`, `lint`,
`db:check`, `test*` (Vitest) e `test:e2e*` (Playwright — sem specs).
