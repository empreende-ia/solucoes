# Dispara

Disparos, automação e atendimento com IA no **WhatsApp API Oficial** (Meta Cloud API).

O Dispara é um SaaS single-tenant (1 deploy = 1 empresa) para criar campanhas com templates aprovados, automatizar fluxos de conversa, receber respostas via webhook e acompanhar entregas/leituras em tempo real — com geração de conteúdo por IA.

## Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript
- **Supabase** (PostgreSQL) — dados e realtime
- **pg_cron (Supabase)** — relógio de fundo: filas de disparo, agendamentos e waits de fluxo (via pg_net → `/api/cron/tick`, sem QStash/Redis)
- **Meta WhatsApp Cloud API v24.0** — envio de templates e webhooks
- **Vercel AI SDK v6** — geração de conteúdo (Gemini via BYOK)
- Tailwind CSS v4 + shadcn/ui (dark-only, emerald)

## Como rodar

```bash
# 1. Instale as dependências
npm install

# 2. Configure as variáveis de ambiente
cp .env.example .env.local
# preencha os valores (veja .env.example)

# 3. Aplique o schema no Supabase
# supabase/migrations/00000000000000_init.sql

# 4. Suba o dev server (Turbopack)
npm run dev
```

Acesse `http://localhost:3000` e faça login com a `MASTER_PASSWORD` definida no `.env.local`.

### Testes

```bash
npm run test        # unit (Vitest)
npm run test:e2e    # E2E (Playwright)
```

## Variáveis de ambiente

Veja [.env.example](./.env.example). Obrigatórias:

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable do Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta (service role) do Supabase |
| `CRON_SECRET` | Segredo do relógio pg_cron (autentica `/api/cron/tick`; igual ao `cron_secret` no Vault do Supabase) |
| `MASTER_PASSWORD` | Senha de login do dashboard |
| `DISPARA_API_KEY` | Chave da REST API (`Bearer` / `X-API-Key`) |
| `DISPARA_ADMIN_KEY` | Chave dos endpoints administrativos |

Opcionais: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (fallback quando não configurados via UI), `GEMINI_API_KEY` (IA) e `MEM0_API_KEY` (memória de conversas).
