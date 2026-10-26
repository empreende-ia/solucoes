# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dispara ("Dispara API Oficial") é um SaaS single-tenant de disparos e automação via WhatsApp API Oficial, construído com Next.js 16 (App Router), React 19 e Supabase (PostgreSQL). O relógio de fundo (disparo em massa, agendamentos, waits de fluxo, reconcile) é o **pg_cron do Supabase** (via pg_net → `/api/cron/tick`) + auto-reinvocação — sem QStash/Redis, o onboarding exige só Supabase + Vercel. Integra Meta WhatsApp Cloud API (v24.0) para mensagens com template e Vercel AI SDK v6 para geração de conteúdo.

**Documentação detalhada em [`docs/`](./docs/)** — arquitetura, instalação,
funcionalidades, banco, API, workflows, IA, operação e testes. Consulte-a antes de inferir
comportamento; atualize-a quando mudar o comportamento documentado.

## Development Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run dev:ai           # Dev server com AI DevTools (AI_DEVTOOLS=1)
npm run build            # Production build
npm run lint             # ESLint

# Unit tests (Vitest, jsdom) — 171 arquivos
npm run test             # Run all
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI dashboard
npm run test:coverage    # Coverage report
vitest run path/to/file.test.ts          # Single test file
vitest run -t "test name"                # Single test by name

# Migrações: aplica tudo num Postgres 17 (PGlite) e verifica (roda no CI)
npm run db:check
npm run db:check -- --verify-only

# E2E (Playwright) — configurado, mas SEM specs no repositório
npm run test:e2e
```

**Scripts quebrados** — apontam para arquivos que NÃO existem (`scripts/` só tem
`check-migrations.mjs` e `meta-audit.mjs`): `test:stress*`, `test:e2e:whatsapp*`,
`test:ai:api*`, `test:all`, `schema:parity`, `schema:baseline:generate`,
`whatsapp:context`, `builder:smoke`, `dev:tunnel*`, `db:migrate:*`, `logs:follow:prod`,
`monitor:all`. Não os cite como disponíveis — lista em
[`docs/testes.md`](./docs/testes.md#scripts-de-npm-quebrados).

**Test file conventions**: `*.test.ts` for Vitest, `*.spec.ts` for Playwright (in `tests/e2e/`).

## Architecture

### Frontend Pattern: Page → Hook → Service → API

```
app/(dashboard)/campaigns/page.tsx    # Thin page: wires hook to view
    ↓
hooks/useCampaigns.ts                 # Controller hook: React Query + UI state
    ↓
services/campaignService.ts           # API calls (fetch wrapper)
    ↓
app/api/campaigns/route.ts            # API Route → Supabase DB
```

- **Pages**: thin components that only connect hooks to views
- **Hooks**: controller pattern with React Query + local state + derived state
- **Services**: typed fetch wrappers for API routes
- **API Routes**: validation (Zod), business logic, DB operations

### Backend Pattern: Serverless + pg_cron

```
API Routes (Next.js)  →  Meta WhatsApp API
        ↓
  Supabase DB (campaign_contacts = fila; claim CAS pending→sending)
        ↑
  pg_cron (a cada minuto, pg_net → /api/cron/tick) + auto-reinvocação (after())
```

O relógio é o pg_cron do Supabase: a função `dispara_cron_tick()` lê `app_base_url`+`cron_secret`
do Vault e faz POST em `/api/cron/tick`, que drena campanhas agendadas, enrollments de fluxo,
reconcile de status e o sweeper do disparo em massa. O hot path do disparo usa auto-reinvocação
(`reinvokeSelf` via `after()`); o pg_cron é a rede de segurança.

### Key Directories

```
app/                    # Next.js App Router
  (auth)/               # Auth pages (login, install wizard)
  (dashboard)/          # Dashboard pages
  api/                  # API routes (28+ sub-directories)
components/
  features/             # Feature-specific view components
  ui/                   # shadcn/ui (new-york style, RSC-enabled)
  builder/              # Workflow builder components
hooks/                  # Controller hooks (React Query pattern)
services/               # API client layer
lib/                    # Business logic & utilities
  ai/                   # AI providers & prompts
  builder/              # Workflow executor
  whatsapp/             # WhatsApp API integration
types.ts                # All TypeScript interfaces & enums
supabase/migrations/    # SQL migrations (31+ files)
```

### Provider Stack (app/providers.tsx)

```
ThemeProvider (next-themes, dark default)
  → QueryClientProvider (staleTime: 30s, gcTime: 5min, retry: 1)
    → DevModeProvider
      → CentralizedRealtimeProvider (Supabase Realtime)
        → PWAProvider
```

## Key Patterns

### Authentication

Single-tenant: no user accounts. **`proxy.ts` (Next 16 proxy) is the auth barrier for every page and `/api/*` route.** It resolves WHO is calling (the *principal*) once and forwards it to handlers via `x-dispara-*` headers (always stripping client-sent ones):

| Principal | Credential |
|---|---|
| `session` | `dispara_session` cookie, validated against `settings.session_tokens` (signed `s2.` token, only `sha256` stored; cache 15s) — `lib/user-auth.ts` |
| `api_key` / `admin_key` | `Authorization: Bearer` or `X-API-Key` with `DISPARA_API_KEY` / `DISPARA_ADMIN_KEY` |
| `cron` | `Bearer CRON_SECRET` (or `DISPARA_ADMIN_KEY`) — only on `cron` / `session_or_cron` routes |
| `attendant` | `dispara_attendant` httpOnly cookie (set by `/api/attendants/validate`) — only on `attendant_or_session` routes |
| `public` | no credential |

- **Per-route policy**: `lib/route-policy.ts` (`API_ROUTE_POLICIES`, exact segment match with `[param]`). Anything not listed is `session` (valid session or API key). Adding a public route requires a `reason` and updating the snapshot in `lib/route-policy.test.ts` (intentional tripwire).
- **In handlers**: use `requirePrincipal(request, kinds)` / `requireAttendantPermission(request, perm)` from `lib/principal.ts`; in Server Actions/RSC loaders use `lib/server-principal.ts`. Never trust `x-dispara-*` headers elsewhere.
- **External callbacks verify themselves**: Meta webhook/Flows → `lib/meta-webhook-signature.ts` (App Secret from env or settings; `report_only` until the first valid signature, then enforced); Google Calendar push → channel token.
- Supabase down → proxy answers **503** (not 401) for owner/attendant credentials it cannot verify.

### Supabase Client Types

The app does NOT use Supabase Auth: all data access is server-side with the service role, and authorization is the proxy's job. The `anon`/`authenticated` roles have no table/function access (migration `20261011000000_security_hardening.sql`).

```typescript
// API Routes (server-side, service role — the proxy already authorized the caller)
import { getSupabaseAdmin } from '@/lib/supabase'
const supabase = getSupabaseAdmin()

// Server Components / Server Actions (server-only, service role) — check
// hasOwnerPrincipal() from lib/server-principal.ts before reading data
import { createClient } from '@/lib/supabase-server'
const supabase = await createClient()

// Browser: ONLY for Realtime broadcast (channel 'dispara-db', no PII, public).
// Never .from()/.rpc() from the browser — fetch the authenticated API instead.
import { getSupabaseBrowser } from '@/lib/supabase'
```

They return `null` when env vars are missing (allows install wizard to run unconfigured). Realtime events are only invalidation *signals* (`lib/realtime-db-change.ts`); never write payload values into the React Query cache.

### Database Layer (No ORM)

```typescript
// lib/supabase-db.ts - Direct Supabase queries with abstracted CRUD
campaignDb.getAll()
campaignDb.create({ name, templateName })
```

### Component/Controller Separation

```tsx
// components/features/campaigns/CampaignListView.tsx - PURE presentational
interface CampaignListViewProps {
  campaigns: Campaign[];
  onDelete: (id: string) => void;
  onRowClick: (id: string) => void;
}

// hooks/useCampaigns.ts - Controller hook
export const useCampaignsController = () => {
  const { data } = useCampaignsQuery();
  const [filter, setFilter] = useState('All');
  const filteredCampaigns = useMemo(() => ...);
  return { campaigns, filter, setFilter, onDelete };
};
```

### WhatsApp Credentials

Fetched from Supabase `settings` table first, env vars as fallback (in-process cache, 60s TTL):

```typescript
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
const credentials = await getWhatsAppCredentials()
```

### Error Handling

```typescript
// lib/whatsapp-errors.ts - 54 error codes mapped
mapWhatsAppError(131042)  // → { type: 'payment', message: '...', action: '...' }
isCriticalError(code)     // Payment, auth errors
isOptOutError(code)       // User blocked business
```

### Phone Number Handling

```typescript
// lib/phone-formatter.ts - E.164 format required
normalizePhoneNumber('+5511999999999')
validatePhoneNumber(phone)  // Uses libphonenumber-js
```

## Workflow Engine

Executor DAG próprio com waits duráveis via Postgres (tabela `workflow_enrollments`) — sem QStash.
Delays pausam o fluxo (persistem `resume_at`) e o pg_cron (`drainWorkflowEnrollments`) os retoma:

```
lib/builder/flow/            # Modelo de AUTORIA (árvore de Step) + compile.ts + layout.ts
lib/builder/workflow-executor.workflow.ts  # Executor do grafo compilado
lib/builder/workflow-enrollments.ts        # Waits (resume_at, CAS, backoff, reap)
lib/cron/workflow-enrollments.ts           # Drena/retoma enrollments vencidos
lib/builder/steps/                         # Handlers das ações (NÃO lib/builder/nodes/)
lib/builder/plugins.ts                     # Registro das ações e seus campos
lib/builder/step-registry.ts               # Import dinâmico por actionType (com allowlist)
```

**StepType**: `whatsapp`, `interactive`, `wait`, `condition`, `split`, `tag`, `tag_remove`,
`pipeline`, `goto`, `end`

**Ações**: `whatsapp/send-message|ask-question|send-template|send-media|send-buttons|send-list`,
`contacts/add-tag|remove-tag`, `crm/move-pipeline`. O passo **Database Query foi removido**
(SQL arbitrário) e `actionType` tem allowlist.

**Gatilhos** (`FlowTriggerType`): `none` | `keywords` | `campaign_reply`

**Settings** (`workflows.settings`): `allowReentry`, `stopOnResponse`, `timeWindow`
(timezone padrão `America/Sao_Paulo`; fora da janela só os passos de comunicação pausam).

O avaliador de condições não usa `new Function`, tem limite de tamanho e é revalidado no
PATCH, create, publish e rollback. `http-request` bloqueia SSRF.

Detalhes em [`docs/workflows.md`](./docs/workflows.md).

## Meta WhatsApp API (v24.0)

### Template Payload Structure

```json
{
  "messaging_product": "whatsapp",
  "to": "+5511999999999",
  "type": "template",
  "template": {
    "name": "template_name",
    "language": { "code": "pt_BR" },
    "components": [
      { "type": "header", "parameters": [{ "type": "image", "image": { "id": "..." } }] },
      { "type": "body", "parameters": [{ "type": "text", "text": "{{1}} value" }] }
    ]
  }
}
```

### Rate Limits

- **Cloud API**: Up to 1000 msgs/sec
- **Pair limit**: 1 msg/6 sec to same user (error 131056)
- **Retry**: Exponential backoff per Meta recommendation

## Database Schema (45 tabelas)

- `settings` — config (credenciais, marca, `session_tokens`), cache de 60s
- `campaigns` — metadados + contadores (sent/delivered/read/failed) + config de A/B
- `campaign_contacts` — **a fila**: status por contato + diagnóstico de falha + `lease_until`
- `contacts` / `contact_lists` / `custom_field_definitions` / `phone_suppressions`
- `templates` / `template_projects` / `template_project_items`
- `inbox_conversations` / `inbox_messages` / `inbox_labels` / `inbox_quick_replies`
- `attendant_tokens` — acesso de atendente por token
- `ai_agents` / `ai_agent_logs` / `ai_knowledge_files` / `ai_embeddings` (pgvector) / `ai_processing_locks`
- `workflows` / `workflow_versions` / `workflow_runs` / `workflow_enrollments` / `workflow_conversations`
- `flows` / `flow_submissions` / `lead_forms`
- `pipelines` / `pipeline_stages` / `opportunities` — CRM
- `whatsapp_status_events` / `processed_inbound_messages` — reconcile e dedupe
- `account_alerts` / `push_subscriptions`

Fila: `claim_campaign_batch(campaign_id, limit, trace_id, worker, lease_seconds)` faz CAS
com lease; `reap_stuck_campaign_sending()` devolve o que estourou o prazo.

**Hardening (`20261011000000_security_hardening.sql`)**: `anon`/`authenticated` perderam
todo privilégio em `public` (tabelas, views, sequences) e `EXECUTE` em todas as funções;
o realtime virou broadcast no canal público `dispara-db`, com payload de ids/status/
contadores apenas — **nunca PII**, porque quem tem a chave publishable pode ouvir e emitir
nesse canal. O front trata o evento como sinal de invalidação e busca pelas APIs.

Lista completa, enums e funções em [`docs/banco-de-dados.md`](./docs/banco-de-dados.md).

## Next.js Configuration

- **React Compiler** enabled (automatic memoization)
- **Standalone output** (Docker-ready)
- **Server Actions**: 20MB body limit
- **Optimized imports**: `lucide-react`, `@radix-ui/react-icons`
- SQL migrations bundled via `outputFileTracingIncludes`
- Path alias: `@/*` → project root

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `CRON_SECRET` (autentica as chamadas do pg_cron a `/api/cron/tick`; deve ser igual ao secret `cron_secret` no Vault do Supabase)
- `MASTER_PASSWORD` (login password)
- `DISPARA_API_KEY`

Optional:
- `DISPARA_ADMIN_KEY` (rotas com política `admin`; também aceito como `cron`)
- `SESSION_SECRET` (≥32 chars; sem ele a chave da sessão deriva de `SUPABASE_SECRET_KEY`).
  Trocar este valor, `SUPABASE_SECRET_KEY` ou `MASTER_PASSWORD` **derruba todas as sessões**
- `META_APP_SECRET`, `META_WEBHOOK_REQUIRE_SIGNATURE` (assinatura dos webhooks da Meta)
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (fallback if not in DB)
- `GEMINI_API_KEY` (AI features)
- `MEM0_API_KEY` (conversation memory)

Env var aliases accepted: `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

## Language Conventions

- **Code**: English (variable names, function names)
- **Comments/Documentation**: Portuguese (pt-BR)
- **UI text**: Portuguese (pt-BR)

## Styling

- Tailwind CSS v4 with shadcn/ui (new-york style)
- **Themes**: dark default plus a light theme with toggle (next-themes)
- Primary brand color: **emerald** — `primary-400/500/600` (emerald/green, `#10b981`)
- Backgrounds: `zinc-800/900/950` (base `#030712`)
- Logo: text wordmark at `public/brand/logo.svg` ("dispara" white + emerald dot)
- Icons: lucide-react exclusively

## Types Reference

```typescript
// types.ts
CampaignStatus: DRAFT | SCHEDULED | SENDING | COMPLETED | PAUSED | FAILED
TemplateCategory: 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO'
ContactStatus: OPT_IN | OPT_OUT | UNKNOWN
```

## Known Behaviors

- **Edge cache flash-back**: Deleted items may momentarily reappear due to Vercel 10s TTL cache
- **Payment alerts**: Auto-shown on error 131042, auto-dismissed when delivery succeeds after fix
- **Null Supabase clients**: `getSupabaseAdmin()` and `getSupabaseBrowser()` return `null` when not configured — callers must handle this for the install wizard flow
- **Cron silencioso**: `dispara_cron_tick()` retorna sem agir quando o Vault não tem `app_base_url`/`cron_secret`. Ausência de erro ≠ funcionando
- **Cache de sessões**: ~15s no proxy — revogar leva até esse tempo para valer
- **503, não 401**: com o banco fora, o proxy responde 503 a credencial de dono/atendente que não consegue verificar (401 faria a PWA do atendente apagar o cookie)
- **Dedupe de webhook**: a Meta reentrega; `processed_inbound_messages` evita a IA responder duas vezes
- **Canal `dispara-db` é público**: só ids/status/contadores no payload, nunca PII
- **OpenAPI defasado**: `public/openapi.yaml` cobre 19 das 206 rotas
