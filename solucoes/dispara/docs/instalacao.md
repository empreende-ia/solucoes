# Instalação

Há dois caminhos: o **wizard** (recomendado — provisiona Vercel e Supabase sozinho) e a
**instalação manual** (para quem já tem os projetos criados ou quer rodar local).

## Pré-requisitos

| Item | Para quê |
| --- | --- |
| Conta Vercel + token de API | Hospedar o app e gravar as env vars |
| Conta Supabase + access token | Banco, Realtime, Vault e pg_cron |
| WhatsApp Business Account na Meta | Número, token e templates |
| Node.js 20+ | Rodar local |

Não é preciso Redis, QStash, worker nem VPS. Supabase + Vercel bastam.

---

## Caminho 1 — Wizard de instalação

Suba o projeto na Vercel (ainda sem env vars) e abra `/install`. O wizard tem 3 passos,
depois provisiona e confirma:

### Passo 1 — Identidade e marca

E-mail e nome do admin, nome da empresa, logo e cor primária. Isso alimenta o whitelabel:
o deploy passa a exibir a marca do cliente em vez de "Dispara".

### Passo 2 — Vercel

Token de API da Vercel. O installer lista times e projetos, valida o token e identifica o
projeto de destino. Ele vai gravar as env vars e disparar o redeploy no fim.

### Passo 3 — Supabase

Access token do Supabase. Daqui o installer pode **criar um projeto novo** (escolhendo
organização e região, detectada automaticamente) ou **reusar um existente**. Ele resolve
as API keys e a URL de conexão do banco sozinho.

### Provisionamento

Com os três passos preenchidos, `/api/installer/provision` executa, em ordem:

1. Aguarda o projeto Supabase ficar pronto (se foi criado agora).
2. Aplica todas as migrações de `supabase/migrations/` no banco.
3. Faz o **bootstrap** da tabela `settings`: admin, nome da empresa, marca, data de
   instalação e **um par de chaves RSA** para o Flow Endpoint dos MiniApps (gerado aqui
   para que publicar um Flow dinâmico não falhe depois).
4. Gera o `CRON_SECRET` e o grava em **dois lugares**: como env var na Vercel (a app valida
   em `verifyCronRequest`) e como secret `cron_secret` no **Vault do Supabase** (o pg_cron
   o lê para assinar o POST). Grava também `app_base_url` no Vault.
5. Garante o `cron.schedule('dispara-cron-tick', '* * * * *', ...)`.
6. Gera `MASTER_PASSWORD`, `DISPARA_API_KEY` e `DISPARA_ADMIN_KEY`, e faz upsert de todas
   as env vars no projeto da Vercel.
7. Dispara o redeploy.

O bootstrap é **idempotente**: se `admin_email` já existe em `settings`, ele não sobrescreve.
Rodar o wizard duas vezes não destrói a configuração.

### Depois do wizard

Falta só o WhatsApp. O app abre o onboarding guiado: credenciais da Meta → configuração do
webhook → primeira mensagem de teste. Veja [a seção da Meta](#configuração-na-meta).

---

## Caminho 2 — Instalação manual

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env.local
# preencha os valores (tabela abaixo)

# 3. Schema no Supabase — aplique as migrações em ordem
#    supabase/migrations/00000000000000_init.sql
#    depois as demais, por ordem de nome de arquivo

# 4. Dev server (Turbopack)
npm run dev
```

Acesse `http://localhost:3000` e entre com a `MASTER_PASSWORD` do `.env.local`.

### Variáveis de ambiente

Obrigatórias:

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable (anon) do Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta (service role) do Supabase |
| `CRON_SECRET` | Segredo do relógio; **deve ser igual** ao secret `cron_secret` no Vault |
| `MASTER_PASSWORD` | Senha de login do dashboard |
| `DISPARA_API_KEY` | Chave da REST API (`Bearer` / `X-API-Key`) |

Opcionais:

| Variável | Descrição |
| --- | --- |
| `DISPARA_ADMIN_KEY` | Chave das rotas `admin` (`/api/vercel/*`, `/api/debug/*`) |
| `SESSION_SECRET` | Segredo de assinatura das sessões (≥ 32 caracteres). Sem ele, a chave é derivada de `SUPABASE_SECRET_KEY` |
| `META_APP_SECRET` | App Secret da Meta para validar `X-Hub-Signature-256`. Também configurável pela UI (a env tem precedência) |
| `META_WEBHOOK_REQUIRE_SIGNATURE` | `true` recusa requisição não assinada mesmo sem App Secret (fail-closed) |
| `WHATSAPP_TOKEN` | Token da Cloud API — fallback se não configurado pela UI |
| `WHATSAPP_PHONE_ID` | ID do número — fallback |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID da WABA — fallback |
| `GEMINI_API_KEY` | Recursos de IA (geração de conteúdo, agentes) |
| `MEM0_API_KEY` | Memória de conversas (Mem0) |

Aliases aceitos: `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.

> Trocar `SESSION_SECRET`, `SUPABASE_SECRET_KEY` ou `MASTER_PASSWORD` **derruba todas as
> sessões do dashboard**. É o comportamento esperado — é assim que se revoga acesso.

### Configurar o pg_cron à mão

Se você não usou o wizard, o relógio não existe. A migração
`20260705000100_cron_infra.sql` cria a extensão, a função e o agendamento, mas a função
sai em silêncio enquanto os secrets não estiverem no Vault. No SQL Editor do Supabase:

```sql
-- 1. Grave os secrets no Vault (substitua os valores)
select vault.create_secret('https://seu-app.vercel.app', 'app_base_url');
select vault.create_secret('SEU_CRON_SECRET', 'cron_secret');

-- 2. Garanta o agendamento (idempotente: upsert pelo nome do job)
select cron.schedule('dispara-cron-tick', '* * * * *', 'select public.dispara_cron_tick();');

-- 3. Confira
select * from cron.job where jobname = 'dispara-cron-tick';
select * from cron.job_run_details order by start_time desc limit 10;
```

O valor de `cron_secret` tem de ser **idêntico** à env var `CRON_SECRET` na Vercel. Se
divergirem, cada tick recebe 401 e nada é drenado: campanhas agendadas não saem, waits de
fluxo não retomam.

Para atualizar um secret que já existe (em vez de criar):

```sql
select vault.update_secret(id, 'novo-valor', name)
from vault.secrets where name = 'cron_secret';
```

---

## Configuração na Meta

### 1. Credenciais

Em **Configurações → Credenciais** do Dispara, informe:

- **Token** permanente da Cloud API (System User Token com `whatsapp_business_messaging`
  e `whatsapp_business_management`).
- **Phone Number ID** do número.
- **WhatsApp Business Account ID** (WABA).

As credenciais ficam na tabela `settings` com cache de 60s em processo — trocar o número
não exige redeploy. As env vars `WHATSAPP_*` são só fallback.

### 2. Webhook

No app da Meta, em **WhatsApp → Configuration → Webhook**:

- **Callback URL**: `https://seu-app.vercel.app/api/webhook`
- **Verify Token**: o que o Dispara mostra na tela de onboarding
- **Campos assinados**: `messages` (obrigatório)
- **App Secret**: configure em `META_APP_SECRET` ou pela UI

`/api/webhook` tem política `public_route_auth`: o chamador é externo, então a própria rota
verifica. GET confere o `verify_token`; POST exige `X-Hub-Signature-256` assinada com o App
Secret.

Enquanto nenhuma assinatura válida tiver chegado, a verificação fica em **`report_only`**
(aceita e registra), para não derrubar a integração durante a configuração. Depois da
primeira assinatura válida passa a ser exigida. Para fechar desde o começo, use
`META_WEBHOOK_REQUIRE_SIGNATURE=true`.

O endpoint `/api/webhook/validate` testa a configuração, e `/api/webhook/info` mostra o
que está registrado. A assinatura da WABA pode ser conferida/forçada por
`/api/meta/webhooks/subscription`.

### 3. Templates

Templates são criados e aprovados na Meta. O Dispara sincroniza o cache local
(`templates`) e permite criar, clonar e submeter rascunhos pela UI — veja
[Funcionalidades](./funcionalidades.md#templates).

### 4. Número pendente

Número que fica em `PENDING` não envia. O diagnóstico está em **Configurações →
Diagnóstico Meta** (`/settings/meta-diagnostics`), que consulta os campos de estado do
número e aponta o que falta (verificação de propriedade, registro com PIN, assinatura do
webhook).

---

## Deploy

O projeto é um Next.js padrão na Vercel — `framework: nextjs`, sem configuração especial
de build. O `vercel.json` só adiciona headers de segurança (HSTS, `X-Frame-Options: DENY`,
`nosniff`, `Referrer-Policy`, `Permissions-Policy` negando câmera/microfone/geolocalização).

Depois de qualquer mudança de env var, redeploy. O app expõe
`/api/vercel/redeploy` (protegido por `DISPARA_ADMIN_KEY`) para disparar isso de dentro.

### Checklist pós-deploy

```bash
# 1. App no ar e configurado
curl https://seu-app.vercel.app/api/health

# 2. O relógio está batendo? (no SQL Editor do Supabase)
#    select * from cron.job_run_details order by start_time desc limit 5;

# 3. O tick autentica? (deve responder 200, não 401)
curl -X POST https://seu-app.vercel.app/api/cron/tick \
  -H "Authorization: Bearer $CRON_SECRET"

# 4. As migrações batem com o schema esperado?
npm run db:check
```
