# Dispara

Disparos, automação e atendimento com IA no **WhatsApp API Oficial** (Meta Cloud API).

SaaS **single-tenant**: um deploy atende uma empresa. Cria campanhas com templates
aprovados, automatiza fluxos de conversa, atende no inbox com agentes de IA, gerencia
oportunidades no CRM e acompanha entregas e leituras em tempo real.

O onboarding exige **só Supabase + Vercel** — sem Redis, QStash, worker ou VPS. O relógio
de fundo é o pg_cron do próprio Supabase.

## O que faz

| | |
| --- | --- |
| **Campanhas** | Wizard de 3 passos, precheck (dry-run) antes de enviar, agendamento, pausa/retomada, teste A/B, pastas e tags, relatório CSV, trace de eventos |
| **Inbox** | Atendimento das respostas, handoff bot ↔ humano, respostas rápidas, etiquetas, notas internas, sugestão de resposta por IA |
| **Atendentes** | Acesso por token com permissões granulares — equipe atendendo sem criar contas de usuário |
| **Contatos** | Importação CSV, campos customizados, tags, listas dinâmicas, supressão automática de números que queimam a reputação |
| **CRM** | Kanban de oportunidades: pipelines, etapas, valor, status |
| **Templates** | Sincronização com a Meta, builder manual com preview fiel, rascunhos, geração por IA (individual e em lote), projetos de template |
| **Workflows** | Builder visual com gatilhos tipados, steps de WhatsApp/contatos/CRM, condições, delays duráveis, versionamento com rollback |
| **IA** | Agentes com RAG (pgvector), reranking, handoff, memória de conversa, tool calling (agendamento no Google Calendar) |
| **MiniApps** | WhatsApp Flows com endpoint dinâmico criptografado |
| **Formulários** | Páginas públicas de captação que criam o contato e disparam o fluxo |
| **Whitelabel** | Nome, logo e cor do cliente, definidos na instalação |

## Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript
- **Supabase** (PostgreSQL + Realtime + Vault + pgvector)
- **`proxy.ts`** — barreira de autenticação de toda página e rota, com política por rota
- **pg_cron** — relógio de fundo: filas de disparo, agendamentos e waits de fluxo
  (via pg_net → `/api/cron/tick`)
- **Meta WhatsApp Cloud API v24.0**
- **Vercel AI SDK v6** — Gemini, GPT e Claude, com chave do cliente (BYOK)
- Tailwind CSS v4 + shadcn/ui (dark-only, emerald)

## Instalação

### Wizard (recomendado)

Suba na Vercel sem env vars e abra `/install`. Em 3 passos (marca, Vercel, Supabase) o
wizard cria o projeto no Supabase, aplica as migrações, gera todos os segredos, configura o
pg_cron no Vault, grava as env vars e redeploya.

### Manual

```bash
npm install
cp .env.example .env.local      # preencha os valores
# aplique supabase/migrations/ em ordem no seu projeto Supabase
npm run dev
```

Acesse `http://localhost:3000` e entre com a `MASTER_PASSWORD`.

O passo a passo completo — incluindo a configuração do pg_cron à mão, o webhook da Meta e o
checklist pós-deploy — está em [docs/instalacao.md](./docs/instalacao.md).

## Comandos

```bash
npm run dev           # dev server (Turbopack)
npm run dev:ai        # dev server com AI DevTools
npm run build         # build de produção
npm run lint          # ESLint
npm run test          # testes unitários (Vitest)
npm run test:watch    # watch
npm run test:coverage # cobertura
npm run db:check      # aplica as migrações num Postgres 17 (PGlite) e verifica
```

> Vários scripts em `package.json` (`test:stress`, `schema:parity`, `monitor:all`,
> `dev:tunnel`, entre outros) apontam para arquivos que não existem no repositório. A lista
> está em [docs/testes.md](./docs/testes.md#scripts-de-npm-quebrados).

## Variáveis de ambiente

Veja [.env.example](./.env.example). Obrigatórias:

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable do Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta (service role) do Supabase |
| `CRON_SECRET` | Segredo do relógio; **deve ser igual** ao secret `cron_secret` no Vault do Supabase |
| `MASTER_PASSWORD` | Senha de login do dashboard |
| `DISPARA_API_KEY` | Chave da REST API (`Bearer` / `X-API-Key`) |

Opcionais: `DISPARA_ADMIN_KEY` (rotas admin), `SESSION_SECRET` (assinatura das sessões —
sem ele a chave é derivada de `SUPABASE_SECRET_KEY`), `META_APP_SECRET` e
`META_WEBHOOK_REQUIRE_SIGNATURE` (assinatura dos webhooks da Meta), `WHATSAPP_TOKEN`,
`WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (fallback quando não configurados pela
UI), `GEMINI_API_KEY` (IA) e `MEM0_API_KEY` (memória de conversas).

> Trocar `SESSION_SECRET`, `SUPABASE_SECRET_KEY` ou `MASTER_PASSWORD` derruba todas as
> sessões do dashboard.

## Documentação

| Documento | O que cobre |
| --- | --- |
| [Arquitetura](./docs/arquitetura.md) | Camadas, backend serverless, o relógio pg_cron, decisões de design |
| [Instalação](./docs/instalacao.md) | Wizard, instalação manual, pg_cron, webhook da Meta |
| [Funcionalidades](./docs/funcionalidades.md) | Tela por tela |
| [Banco de dados](./docs/banco-de-dados.md) | 45 tabelas, funções SQL, migrações, hardening |
| [API REST](./docs/api.md) | Políticas de autenticação e as 206 rotas por área |
| [Workflows](./docs/workflows.md) | Builder, gatilhos, steps, waits duráveis |
| [IA](./docs/ia.md) | Agentes, RAG, provedores, handoff, ferramentas |
| [Operação](./docs/operacao.md) | Cron, limites da Meta, erros, troubleshooting |
| [Testes](./docs/testes.md) | Vitest, Playwright, estado real da suíte |
| [Apresentação comercial](./docs/apresentacao/) | Deck de 12 slides em PDF para clientes |

Há também um Swagger UI em `/docs` servindo `public/openapi.yaml` — que cobre 19 das 206
rotas e está defasado; a referência completa é [docs/api.md](./docs/api.md).

## Convenções

- **Código** em inglês; **comentários e documentação** em português (pt-BR); **UI** em
  português (pt-BR).
- Frontend em quatro camadas: Page → Hook → Service → API Route, com o `proxy.ts` na frente.
- Views em `components/features/` são puramente apresentacionais; a lógica fica nos hooks.
