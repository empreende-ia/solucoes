# Arquitetura

O Dispara é um SaaS **single-tenant**: um deploy atende uma empresa. Não há tabela de
usuários nem multi-tenancy — a separação entre clientes é a separação entre deploys.
Isso elimina RLS por tenant, convites, billing interno e o risco de vazamento entre contas.

## Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router) — Vercel                           │
│                                                             │
│  proxy.ts  →  app/(dashboard)  →  hooks/ → services/ → api/ │
│  (auth)       app/(auth)        (React Query) (fetch) (206) │
│  app/atendimento                                            │
│  app/(public)/f                                             │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
     ┌──────────────────┐          ┌─────────────────────┐
     │  Supabase        │          │  Meta WhatsApp      │
     │  PostgreSQL      │◀────────▶│  Cloud API v24.0    │
     │  + Realtime      │ webhook  │                     │
     │  + Vault         │          └─────────────────────┘
     │  + pg_cron/pg_net│
     └────────┬─────────┘
              │  a cada minuto: POST /api/cron/tick
              └──────────────────────────────────────▶ (volta pro app)
```

## Frontend: Page → Hook → Service → API

Quatro camadas, cada uma com uma responsabilidade:

```
app/(dashboard)/campaigns/page.tsx    # Página fina: só liga o hook à view
    ↓
hooks/useCampaigns.ts                 # Hook controller: React Query + estado de UI
    ↓
services/campaignService.ts           # Chamadas HTTP tipadas
    ↓
app/api/campaigns/route.ts            # Principal já resolvido pelo proxy + Zod + regra + banco
```

- **Páginas** não têm lógica. Montam o hook e passam o resultado para a view.
- **Hooks** (`hooks/`) são o controller: query, mutations, estado local, estado derivado.
- **Services** (`services/`) são wrappers de `fetch` com tipos — nenhuma regra de negócio.
- **API Routes** validam com Zod, aplicam a regra e falam com o banco.
- **Views** (`components/features/`) são puramente apresentacionais: recebem props, emitem callbacks.

Exemplo da separação view/controller:

```tsx
// components/features/campaigns/CampaignListView.tsx — apresentacional
interface CampaignListViewProps {
  campaigns: Campaign[]
  onDelete: (id: string) => void
  onRowClick: (id: string) => void
}

// hooks/useCampaigns.ts — controller
export const useCampaignsController = () => {
  const { data } = useCampaignsQuery()
  const [filter, setFilter] = useState('All')
  const filteredCampaigns = useMemo(() => /* ... */, [data, filter])
  return { campaigns: filteredCampaigns, filter, setFilter, onDelete }
}
```

## Backend: serverless + pg_cron

Não há worker, fila externa, Redis nem QStash. O backend são as rotas do Next.js na Vercel,
e o **relógio de fundo é o pg_cron do Supabase**.

### O relógio

```
pg_cron (a cada minuto)
    ↓
public.dispara_cron_tick()          — lê app_base_url + cron_secret do Vault
    ↓  pg_net → POST + Authorization: Bearer <cron_secret>
/api/cron/tick
    ├── drainScheduledCampaigns()   — campanhas agendadas que venceram
    ├── drainWorkflowEnrollments()  — waits de fluxo com resume_at vencido
    ├── drainStuckCampaigns()       — sweeper: campanhas SENDING paradas
    └── reconcilePendingStatusEvents() — status da Meta que o webhook não casou
```

A função é `SECURITY DEFINER` porque acessa `vault.decrypted_secrets`. Enquanto o
installer não gravar os secrets, ela retorna em silêncio — o deploy pode preceder a
configuração sem gerar erro a cada minuto.

Por que o Vault e não uma tabela: a URL pública e o segredo do cron nunca ficam em texto
plano numa tabela que a aplicação lê.

### O hot path do disparo

Disparar 10 mil mensagens em ticks de 1 minuto seria lento. Então o disparo em massa usa
**auto-reinvocação**: `/api/campaign/dispatch` processa um lote, e antes de responder
agenda a próxima invocação de si mesmo via `after()` do Next.js (`reinvokeSelf`). O
pg_cron é a rede de segurança — se uma reinvocação morrer (timeout, deploy no meio,
erro não tratado), o sweeper `drainStuckCampaigns()` encontra a campanha parada e a retoma.

### A fila

`campaign_contacts` **é** a fila. Cada linha é um contato de uma campanha com seu próprio
status. O claim de um lote é um **CAS** (compare-and-swap): `UPDATE ... SET status='sending'
WHERE status='pending'` com `RETURNING`. Duas invocações concorrentes não pegam o mesmo
contato — quem perde o UPDATE não recebe a linha de volta.

## Autenticação

Single-tenant, sem contas de usuário — e **sem Supabase Auth**. Todo acesso legítimo ao
banco é service role no servidor; quem autoriza é o `proxy.ts`.

### O proxy é a barreira

`proxy.ts` (proxy do Next 16) intercepta **toda** página e **toda** rota `/api/*`. Ele
resolve uma vez quem está chamando — o **principal** — e repassa o resultado ao handler
por headers `x-dispara-*`, sempre removendo os que vierem do cliente.

| Principal | Credencial |
| --- | --- |
| `session` | Cookie `dispara_session`, validado contra `settings.session_tokens` |
| `api_key` / `admin_key` | `Authorization: Bearer` ou `X-API-Key` com `DISPARA_API_KEY` / `DISPARA_ADMIN_KEY` |
| `cron` | `Bearer CRON_SECRET` (ou `DISPARA_ADMIN_KEY`), só em rotas `cron` / `session_or_cron` |
| `attendant` | Cookie httpOnly `dispara_attendant`, emitido por `/api/attendants/validate` |
| `public` | Sem credencial |

### Política por rota

`lib/route-policy.ts` guarda `API_ROUTE_POLICIES`: casamento **exato por segmento** (com
`[param]` e `[...param]`), nunca por prefixo solto. Oito políticas:

| Política | Quem passa |
| --- | --- |
| `public` | Qualquer um |
| `public_route_auth` | Qualquer um — **a rota verifica** (assinatura da Meta, token do Google, honeypot) |
| `cron` | Só `cron` |
| `session_or_cron` | Dono (sessão/API key/admin) ou `cron` |
| `attendant_or_session` | Dono ou atendente — a rota ainda confere a permissão do atendente |
| `admin` | Sessão do dono ou `DISPARA_ADMIN_KEY` |
| `installer` | Aberta até a instalação; depois sessão/admin |
| `session` | **O padrão.** Rota que não está na lista exige sessão válida ou API key |

Cada exceção na tabela carrega um campo `reason` obrigatório, e a lista tem snapshot em
`lib/route-policy.test.ts`. Adicionar rota pública sem justificar quebra o teste de
propósito — é um alarme, não um incômodo.

### Dentro do handler

```typescript
import { requirePrincipal, requireAttendantPermission } from '@/lib/principal'

const principal = requirePrincipal(request, ['session', 'api_key'])
requireAttendantPermission(request, 'canReply')
```

Em Server Actions e loaders RSC, use `lib/server-principal.ts`. Fora desses pontos, os
headers `x-dispara-*` não devem ser lidos.

### A sessão

Token no formato `s2.<uuid>.<hmac>`. A chave do HMAC é derivada de um segredo de servidor
de alta entropia misturado com a senha:

```
HMAC-SHA256(SESSION_SECRET ?? SUPABASE_SECRET_KEY, 'dispara-session-v2|' + MASTER_PASSWORD)
```

O token não serve de oráculo offline da `MASTER_PASSWORD` (o formato `s1.` antigo usava a
própria senha como chave). Cookie forjado sem assinatura válida é rejeitado **sem tocar no
banco**. No banco fica só o `sha256` do token. A lista de sessões é cacheada ~15s no proxy:
um flood de cookies forjados custa no máximo uma query a cada 15s por instância.

Trocar `SESSION_SECRET`, `SUPABASE_SECRET_KEY` ou `MASTER_PASSWORD` derruba todas as sessões.

### Banco fora do ar

Credencial de dono ou atendente que o proxy **não consegue verificar** recebe **503**, não
401 — a diferença importa: 401 faria a PWA do atendente apagar o cookie e exigir novo
token a cada oscilação do banco. Só um cookie assinado por este servidor abre o modo
degradado (página sem dados, APIs em 503).

### Chamadores externos

| Origem | Como se prova |
| --- | --- |
| Webhook da Meta | `X-Hub-Signature-256` via `lib/meta-webhook-signature.ts`. O App Secret vem da env ou das configurações; fica em `report_only` até a primeira assinatura válida, depois é exigido |
| WhatsApp Flows | Mesma assinatura + criptografia RSA/AES do endpoint |
| Google Calendar push | `X-Goog-Channel-Token` |
| Formulário público | Slug ativo + honeypot |

`META_WEBHOOK_REQUIRE_SIGNATURE=true` recusa requisição não assinada mesmo sem App Secret
configurado (fail-closed total).

## Clientes Supabase

Três clientes, um por contexto. Usar o errado vazia ou quebra RLS:

```typescript
// API Routes (server-side, bypassa RLS via service role)
import { getSupabaseAdmin } from '@/lib/supabase'
const supabase = getSupabaseAdmin()

// Client components (browser, respeita RLS)
import { getSupabaseBrowser } from '@/lib/supabase'
const supabase = getSupabaseBrowser()

// Server Components (cookie-aware, @supabase/ssr)
import { createClient } from '@/lib/supabase-server'
const supabase = await createClient()
```

Os dois primeiros retornam **`null`** quando as env vars faltam — é o que permite o wizard
de instalação rodar num deploy ainda não configurado. Todo caller precisa tratar o `null`.

## Camada de dados

Sem ORM. `lib/supabase-db.ts` expõe um CRUD fino por entidade sobre o client do Supabase:

```typescript
campaignDb.getAll()
campaignDb.create({ name, templateName })
```

Queries mais complexas (agregações, segmentação de contatos, contadores de tag) vivem em
funções SQL no banco, chamadas via `rpc()`.

## Credenciais do WhatsApp

Lidas da tabela `settings` primeiro, env vars como fallback, com cache em processo de 60s:

```typescript
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
const credentials = await getWhatsAppCredentials()
```

Isso permite trocar o número ou o token pela UI sem redeploy.

## Realtime

`CentralizedRealtimeProvider` mantém **um** canal Supabase Realtime para todo o app em vez
de um canal por componente.

Desde o hardening de outubro de 2026 o transporte não é mais `postgres_changes` (que
dependia das policies de `anon`, hoje inexistentes). Uma trigger no banco
(`dispara_broadcast_change`) publica no canal público **`dispara-db`**, evento `db_change`,
um payload com **apenas colunas não sensíveis**: ids, status, contadores e timestamps.

> Nunca inclua PII nesse payload — nome, telefone, e-mail, conteúdo de mensagem,
> `custom_fields`. Quem tem a chave publishable pode ouvir **e emitir** nesse canal.

O frontend trata o evento como **sinal de invalidação**: recebe o aviso e busca os dados
reais pelas APIs autenticadas. Os filtros ficam centralizados em `REALTIME_FILTERS` e têm
teste de contrato (`lib/realtime-db-change.contract.test.ts`) garantindo que cada filtro
usa coluna presente em `new` **e** `old`.

Como cada evento vira uma linha em `realtime.messages` (que o Realtime só limpa dias
depois), o volume é controlado na própria trigger:

- `campaign_contacts` **não tem trigger** — o progresso do disparo viria por contato;
- `campaigns` publica INSERT/DELETE sempre, e UPDATE só em mudança de status/conclusão/
  cancelamento/pasta ou contadores, no máximo 1× a cada 2s por campanha;
- `inbox_messages` não publica a cópia do template de campanha nem seus updates de status;
- `inbox_conversations` publica só mudança de estado do atendimento;
- `contacts` e `flow_submissions` usam trigger por STATEMENT (um evento por importação).

O progresso do disparo usa um caminho separado (`lib/realtime-broadcast-server.ts`), que
não grava em `realtime.messages`.

## Stack de providers

```
ThemeProvider (next-themes, dark fixo)
  └── QueryClientProvider (staleTime 30s, gcTime 5min, retry 1)
      └── DevModeProvider
          └── CentralizedRealtimeProvider
              └── PWAProvider
```

## Estrutura de diretórios

```
proxy.ts           barreira de autenticação de toda página e rota /api/*
app/
  (auth)/          login + wizard de instalação
  (dashboard)/     dashboard autenticado
  (public)/f/      formulários de captação públicos
  atendimento/     monitor de atendente (acesso por token)
  api/             206 rotas
  docs/            Swagger UI servindo public/openapi.yaml
components/
  features/        views por feature (campaigns, inbox, crm, ...)
  ui/              shadcn/ui (new-york, RSC)
  builder/         canvas e nós do builder de workflow
  install/         telas do wizard
  layout/          shell e sidebar
hooks/             hooks controller (76 arquivos)
services/          clientes HTTP das rotas
lib/
  route-policy.ts  política de autenticação de cada rota
  principal.ts     quem está chamando (lido pelos handlers)
  user-auth.ts     sessão do dashboard (token s2, cache)
  attendant-auth.ts sessão do atendente
  ai/              provedores, prompts, RAG, agentes, ferramentas
  builder/         executor de workflow, steps, compilador de fluxo
  cron/            drenos chamados pelo tick
  inbox/           lógica de conversas
  installer/       máquina de estados do wizard, Vercel e Supabase
  whatsapp/        integração com a Cloud API
  business/        regras de negócio compartilhadas
types.ts           interfaces e enums do domínio (861 linhas)
supabase/migrations/
```

Alias de path: `@/*` → raiz do projeto.

## Configuração do Next.js

- **React Compiler** ligado (memoização automática — por isso há menos `useMemo` manual).
- **Output standalone** (pronto para Docker).
- **Server Actions** com limite de corpo de 20MB (importação de CSV).
- Imports otimizados: `lucide-react`, `@radix-ui/react-icons`.
- Migrações SQL empacotadas no bundle via `outputFileTracingIncludes` — o installer
  precisa lê-las em runtime.
