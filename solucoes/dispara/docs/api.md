# API REST

206 rotas em `app/api/`. Há um Swagger UI em `/docs` servindo `public/openapi.yaml`, mas
**o OpenAPI está defasado**: descreve 19 rotas. Este documento é a referência completa por
área.

## Autenticação

Toda rota passa pelo `proxy.ts` antes do handler. Ele identifica o chamador e aplica a
política daquela rota (`lib/route-policy.ts`). Detalhes do modelo em
[Arquitetura](./arquitetura.md#autenticação).

### Credenciais

```http
Authorization: Bearer <DISPARA_API_KEY>
```
ou
```http
X-API-Key: <DISPARA_API_KEY>
```

| Credencial | Serve para |
| --- | --- |
| Cookie `dispara_session` | A UI, após login com `MASTER_PASSWORD` |
| `DISPARA_API_KEY` | Integrações — acesso de dono à maioria das rotas |
| `DISPARA_ADMIN_KEY` | Rotas `admin` (`/api/vercel/*`, `/api/debug/*`, manutenção) |
| `CRON_SECRET` | Só rotas `cron` / `session_or_cron` |
| Cookie `dispara_attendant` | PWA de atendente, nas rotas `attendant_or_session` |

### Políticas

O padrão é `session`: **rota que não está listada em `API_ROUTE_POLICIES` exige sessão
válida ou API key.** As exceções, e só elas:

| Política | Rotas |
| --- | --- |
| `public` | `/api/auth/login` (POST) · `/api/auth/logout` (POST) · `/api/auth/status` (GET) · `/api/brand` (GET) · `/api/health` (GET) · `/api/public/lead-forms/[slug]` (GET) |
| `public_route_auth`<br>(a rota verifica) | `/api/webhook` · `/api/flows/endpoint` · `/api/integrations/google-calendar/webhook` · `/api/public/lead-forms/[slug]/submit` · `/api/attendants/validate` |
| `cron` | `/api/cron/tick` · `/api/campaign/workflow` · `/api/builder/workflow/[id]/execute` · `/api/builder/workflow/[id]/resume` · `/api/ai/respond` |
| `session_or_cron` | `/api/campaign/dispatch` (POST) |
| `attendant_or_session` | `/api/attendant/conversations` (GET) · `/api/inbox/conversations/[id]` (GET) · `/messages` (GET, POST) · `/takeover` · `/return-to-bot` · `/api/templates` (GET) · `/api/push/subscribe` · `/api/push/unsubscribe` |
| `admin` | `/api/vercel/info` · `/api/vercel/redeploy` · `/api/push/send` · `/api/webhook/reconcile-status-events` · `/api/templates/preview/backfill` · `/api/debug/[...path]` |
| `installer` | `/api/installer/[...path]` — aberta até a instalação, depois sessão/admin |

`public_route_auth` **não é rota aberta**: o chamador é externo (Meta, Google, formulário),
então a verificação é da própria rota — assinatura `X-Hub-Signature-256`, token de canal do
Google, slug ativo mais honeypot.

Nas rotas `attendant_or_session`, passar pelo proxy não basta: a rota ainda confere a
permissão do atendente (`canView`, `canReply`, `canHandoff`) via
`requireAttendantPermission()`.

### Respostas de erro do proxy

| Status | Quando |
| --- | --- |
| `401` | Sem credencial válida |
| `403` | Credencial válida, mas o principal não é aceito por aquela política |
| `503` | Banco indisponível — o proxy não conseguiu verificar a credencial |

O 503 é proposital: um 401 faria a PWA do atendente apagar o cookie a cada oscilação do
banco.

### Adicionando uma rota

A rota nova nasce `session` sem você fazer nada. Para torná-la pública ou dar outra
política, inclua a regra em `API_ROUTE_POLICIES` com um `reason` e atualize o snapshot em
`lib/route-policy.test.ts` — o teste quebra de propósito, para que abrir uma rota seja uma
decisão explícita.

## Exemplo

```bash
# Listar campanhas
curl https://seu-app.vercel.app/api/campaigns \
  -H "Authorization: Bearer $DISPARA_API_KEY"

# Criar campanha
curl -X POST https://seu-app.vercel.app/api/campaigns \
  -H "Authorization: Bearer $DISPARA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Black Friday","templateName":"promo_bf"}'

# Importar contatos
curl -X POST https://seu-app.vercel.app/api/contacts/import \
  -H "Authorization: Bearer $DISPARA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contacts":[{"phone":"+5511999999999","name":"Maria"}]}'
```

---

## Rotas por área

### Autenticação — 3

| Rota | Métodos | O que faz |
| --- | --- | --- |
| `/api/auth/login` | POST | Login com `MASTER_PASSWORD`; emite o cookie `dispara_session` |
| `/api/auth/logout` | POST | Encerra a sessão (precisa funcionar com sessão expirada) |
| `/api/auth/status` | GET | Decide entre login, wizard e dashboard |

### Campanhas — 21

| Rota | O que faz |
| --- | --- |
| `/api/campaigns` | Lista e cria |
| `/api/campaigns/[id]` | Lê, atualiza, remove |
| `/api/campaigns/[id]/metrics` | Métricas (por variante quando A/B) |
| `/api/campaigns/[id]/messages` | Mensagens da campanha |
| `/api/campaigns/[id]/trace` · `/trace-events` | Linha do tempo de eventos |
| `/api/campaigns/[id]/report.csv` | Relatório CSV |
| `/api/campaigns/[id]/clone` | Duplica |
| `/api/campaigns/[id]/cancel-schedule` | Cancela agendamento |
| `/api/campaigns/[id]/resend-skipped` | Reenvia os pulados |
| `/api/campaigns/folders` · `/folders/[id]` | Pastas |
| `/api/campaigns/tags` · `/tags/[id]` | Tags |
| `/api/campaign/precheck` | **Dry-run**: valida template, telefones e variáveis |
| `/api/campaign/dispatch` | Hot path do disparo (auto-reinvocação) |
| `/api/campaign/[id]/pause` · `/resume` · `/cancel` | Controle do disparo |
| `/api/campaign/[id]/status` | Status corrente |
| `/api/campaign/workflow` | Disparo acionado por workflow |

### Contatos — 17

| Rota | O que faz |
| --- | --- |
| `/api/contacts` · `/api/contacts/[id]` | CRUD |
| `/api/contacts/import` | Importação (CSV/JSON) |
| `/api/contacts/ids` | Só os IDs (seleção em massa) |
| `/api/contacts/stats` | Contadores |
| `/api/contacts/tags` · `/tag-counts` | Tags e contagem |
| `/api/contacts/bulk-tags` · `/bulk-status` · `/bulk-custom-field` | Ações em massa |
| `/api/contacts/segment-count` | Quantos contatos um filtro alcança |
| `/api/contacts/country-codes` · `/state-codes` | Dados para segmentação geográfica |
| `/api/contact-lists` · `/[id]` | Listas com membros dinâmicos |
| `/api/custom-fields` · `/[id]` | Campos customizados |
| `/api/phone-suppressions/active` · `/[phone]` | Supressões |

### Templates — 14

| Rota | O que faz |
| --- | --- |
| `/api/templates` | Lista e sincroniza com a Meta |
| `/api/templates/[name]` | Lê e remove |
| `/api/templates/[name]/clone` | Clona |
| `/api/templates/[name]/marketing-variables` | Variáveis de marketing |
| `/api/templates/create` | Cria na Meta |
| `/api/templates/bulk-delete` | Remoção em massa |
| `/api/templates/drafts` · `/[id]` · `/[id]/submit` | Rascunhos e submissão |
| `/api/templates/preview/backfill` | Recalcula previews |
| `/api/template-projects` · `/[id]` · `/[id]/sync` · `/items/[id]` | Projetos de template |

### Inbox — 14

| Rota | O que faz |
| --- | --- |
| `/api/inbox/conversations` · `/[id]` | Lista e detalhe |
| `/api/inbox/conversations/[id]/messages` | Mensagens |
| `/api/inbox/conversations/[id]/read` | Marca lida |
| `/api/inbox/conversations/[id]/takeover` · `/return-to-bot` | Handoff humano ↔ bot |
| `/api/inbox/conversations/[id]/handoff` | Pedido de handoff |
| `/api/inbox/conversations/[id]/pause` · `/resume` | Suspende o agente |
| `/api/inbox/suggest` | Sugestão de resposta por IA |
| `/api/inbox/labels` | Etiquetas |
| `/api/inbox/quick-replies` · `/[id]` | Respostas rápidas |
| `/api/attendant/conversations` | Conversas vistas pelo token do atendente |

### Atendentes — 3

`/api/attendants` · `/api/attendants/[id]` · `/api/attendants/validate` (valida token)

### Workflows (builder) — 19

| Rota | O que faz |
| --- | --- |
| `/api/builder/workflows` · `/create` · `/current` | Lista, cria, atual |
| `/api/builder/workflows/[id]` | Lê, atualiza, remove |
| `/api/builder/workflows/[id]/publish` · `/versions` · `/rollback` | Versionamento |
| `/api/builder/workflows/[id]/run` · `/executions` | Execução |
| `/api/builder/workflows/[id]/enroll` | Inscreve um contato |
| `/api/builder/workflows/[id]/webhook` | Gatilho por webhook |
| `/api/builder/workflows/[id]/code` · `/download` | Código do fluxo |
| `/api/builder/workflows/[id]/duplicate` | Duplica |
| `/api/builder/workflows/metrics` | Métricas agregadas |
| `/api/builder/workflows/executions/[id]/status` · `/logs` | Execução específica |
| `/api/builder/workflow/[id]/execute` · `/resume` | Executor (interno) |

### IA — 13

| Rota | O que faz |
| --- | --- |
| `/api/ai-agents` · `/[id]` | CRUD de agentes |
| `/api/ai-agents/[id]/chat` · `/test` | Conversar e testar |
| `/api/ai-agents/knowledge` | Base de conhecimento |
| `/api/ai-agents/llm-providers` · `/embedding-providers` | Provedores disponíveis |
| `/api/ai/respond` | Resposta do agente (usado pelo webhook) |
| `/api/ai/extract-content` | Extrai conteúdo de uma URL |
| `/api/ai/generate-utility-templates` | Gera templates de utilidade |
| `/api/ai/generate-flow-form` | Gera formulário de fluxo |
| `/api/ai/test` · `/test-strategy` | Testes de configuração |
| `/api/mem0/memories/[phone]` · `/summary` · `/memory/[id]` | Memória de conversa |

### Flows / MiniApps — 10

| Rota | O que faz |
| --- | --- |
| `/api/flows` · `/[id]` | CRUD (lista é pública) |
| `/api/flows/[id]/meta/publish` | Publica na Meta |
| `/api/flows/send` | Envia o Flow a um contato |
| `/api/flows/templates` | Templates de Flow |
| `/api/flows/endpoint` · `/keys` · `/test` | Flow Endpoint dinâmico (RSA) |
| `/api/flows/submissions` · `/report.csv` | Submissões |

### Formulários de captação — 6

`/api/lead-forms` · `/[id]` · `/api/public/lead-forms/[slug]` · `/[slug]/submit` (públicos) ·
`/api/submissions` · `/api/submissions/export.csv`

### CRM — 5

`/api/pipelines` · `/[id]` · `/[id]/stages` · `/api/opportunities` · `/[id]`

### Webhook — 4

| Rota | O que faz |
| --- | --- |
| `/api/webhook` | GET verifica (`verify_token`), POST recebe mensagens e status. Assinatura `X-Hub-Signature-256` |
| `/api/webhook/validate` | Testa a configuração |
| `/api/webhook/info` | O que está registrado |
| `/api/webhook/reconcile-status-events` | Reconciliação manual de status (**admin**) |

### Meta — 6

`/api/meta/diagnostics` · `/simulate-10033` · `/api/meta/uploads/template-header` ·
`/api/meta/webhooks/subscription` · `/api/phone-numbers` ·
`/api/phone-numbers/[id]/webhook/override`

### Integrações — 9

Google Calendar: `/api/integrations/google-calendar/connect` · `/callback` · `/disconnect` ·
`/status` · `/config` · `/calendars` · `/events` · `/slots` · `/webhook`

### Configurações — 23

`/api/settings/all` · `/credentials` · `/brand` · `/ai` · `/ai-agents-toggle` · `/inbox` ·
`/mem0` · `/helicone` · `/meta-app` · `/phone-number` · `/domains` · `/performance` ·
`/whatsapp-throttle` · `/auto-suppression` · `/booking` · `/calendar-booking` ·
`/google-calendar` · `/onboarding` · `/workflow-builder` · `/workflow-execution` ·
`/test-connection` · `/test-contact` · `/validate-permissions`

### Installer — 12

`/api/installer/bootstrap` · `/provision` · `/run` · `/run-stream` · `/health-check` ·
`/supabase-projects` · `/supabase/create-project` · `/organizations` · `/preflight` ·
`/project-status` · `/pause-project` · `/resolve`

Todas públicas — é o wizard rodando num deploy ainda não configurado.

### Operação — 8

| Rota | Auth | O que faz |
| --- | --- | --- |
| `/api/cron/tick` | `cron` | O tick: drena campanhas, enrollments, reconcile |
| `/api/health` | pública | Health check — payload completo só para o dono |
| `/api/system` | sessão | Info do sistema |
| `/api/dashboard/stats` | API key | Contadores do dashboard |
| `/api/account/limits` · `/alerts` | API key | Limites da WABA e alertas |
| `/api/usage` | API key | Uso |
| `/api/brand` | pública | Marca do deploy (já sai no HTML SSR e no manifest) |
| `/api/messages/send-test` | API key | Mensagem de teste |
| `/api/vercel/info` · `/redeploy` | **admin** | Estado do deploy e redeploy |
| `/api/push/subscribe` · `/unsubscribe` | atendente/sessão | Inscrição de push |
| `/api/push/send` | **admin** | Envio manual de push |

### Debug — 7

`/api/debug/ai-logs` · `/campaign-contacts/[id]` · `/campaigns/[id]/audit` · `/mem0` ·
`/meta/template-analytics` · `/supabase-tables` · `/webhook/test`

Política `admin`: exigem sessão do dono ou `DISPARA_ADMIN_KEY`.

## Validação e erros

Entrada validada com Zod (`lib/api-validation.ts`). Erros da Cloud API são traduzidos por
`lib/whatsapp-errors.ts` (54 códigos mapeados):

```typescript
mapWhatsAppError(131042)   // → { category: 'payment', message, action }
isCriticalError(code)      // pagamento, autenticação
isOptOutError(code)        // usuário bloqueou o negócio
isRetryableError(code)     // vale tentar de novo
getUserFriendlyMessage(code)
getRecommendedAction(code)
```

## Atualizando o OpenAPI

`public/openapi.yaml` cobre 19 rotas das 206. Ao editar uma rota documentada, atualize o
YAML; ao criar rota nova, documente-a aqui e, se for de uso externo, adicione ao YAML.
