# Operação

## O relógio

Tudo que não é pedido do usuário passa pelo tick. Se o tick não roda, o produto parece
quebrado sem erro na tela: campanha agendada não sai, fluxo em delay não retoma, status
fica desatualizado.

```
pg_cron (cada minuto) → dispara_cron_tick() → POST /api/cron/tick
```

O tick executa quatro drenos, independentes (um falhar não para os outros):

| Dreno | Função | O que faz |
| --- | --- | --- |
| Campanhas agendadas | `drainScheduledCampaigns()` | Inicia campanhas cuja hora chegou |
| Waits de fluxo | `drainWorkflowEnrollments()` | Retoma enrollments com `resume_at` vencido |
| Sweeper de disparo | `drainStuckCampaigns()` | Retoma campanhas `SENDING` paradas |
| Reconciliação | `reconcilePendingStatusEvents({ limit: 200 })` | Casa status da Meta que o webhook não casou |

### Conferir se está batendo

No SQL Editor do Supabase:

```sql
-- O job existe?
select * from cron.job where jobname = 'dispara-cron-tick';

-- Rodou? Com que resultado?
select status, start_time, end_time, return_message
from cron.job_run_details
where jobname = 'dispara-cron-tick'
order by start_time desc limit 20;
```

`status = succeeded` significa que a **função rodou** — não que o POST deu 200. O
`net.http_post` é assíncrono. Para ver a resposta HTTP:

```sql
select id, status_code, content, created
from net._http_response
order by created desc limit 20;
```

### O tick está dando 401

Causa quase sempre a mesma: `cron_secret` no Vault ≠ `CRON_SECRET` na Vercel.

```sql
-- Qual secret o pg_cron está usando?
select name, decrypted_secret from vault.decrypted_secrets
where name in ('app_base_url', 'cron_secret');
```

Compare com a env var na Vercel e corrija o lado errado:

```sql
select vault.update_secret(id, 'valor-correto', name)
from vault.secrets where name = 'cron_secret';
```

Teste direto:

```bash
curl -i -X POST https://seu-app.vercel.app/api/cron/tick \
  -H "Authorization: Bearer $CRON_SECRET"
```

> Houve um caso em produção em que o proxy liberava apenas API keys e **barrava o
> `Bearer CRON_SECRET`** — o tick do pg_cron e o `reinvokeSelf` morriam calados. Hoje
> `lib/route-policy.ts` dá política `cron` a `/api/cron/tick`, `/api/campaign/workflow`,
> `/api/ai/respond` e aos dois endpoints de workflow do executor; `/api/campaign/dispatch`
> é `session_or_cron`. Se uma rota do hot path passar a responder 401 ao `CRON_SECRET`,
> confira a política dela antes de procurar no código da rota.

O `DISPARA_ADMIN_KEY` também é aceito como `cron` — é o fallback do `reinvokeSelf` quando
o `CRON_SECRET` não está disponível.

### O tick está silencioso (nem tenta)

`dispara_cron_tick()` retorna sem fazer nada quando `app_base_url` ou `cron_secret` não
estão no Vault. É proposital (o deploy pode preceder a configuração), mas significa que a
ausência de erro **não** é sinal de saúde. Confira o Vault.

## Disparo em massa

### Como escala

O hot path não espera o tick. `/api/campaign/dispatch` processa um lote e, antes de
responder, agenda a próxima invocação de si mesmo via `after()` (`reinvokeSelf`). O lote é
reivindicado por `claim_campaign_batch()` — CAS com lease.

```
dispatch → claim_campaign_batch(lote) → envia → reinvokeSelf → dispatch → ...
                                                      ↑
                              se morrer: drainStuckCampaigns() retoma no próximo tick
```

### Campanha travada em SENDING

1. Veja o trace: `/api/campaigns/[id]/trace-events` ou o painel na UI.
2. Veja se há contatos presos com lease vencida:

```sql
select status, count(*) from campaign_contacts
where campaign_id = 'camp_xxx' group by status;

select count(*) from campaign_contacts
where campaign_id = 'camp_xxx' and status = 'sending' and lease_until < now();
```

3. `reap_stuck_campaign_sending()` devolve esses à fila — o sweeper do tick a chama. Se o
   tick não estiver rodando, resolva o tick primeiro.
4. Auditoria completa: `/api/debug/campaigns/[id]/audit`.

### Ajustar velocidade

Configurações → Performance / Turbo: throttle, concorrência e tamanho de lote
(`/api/settings/whatsapp-throttle`, `/api/settings/performance`). Subir isso acima do que a
Meta permite não acelera — gera `131056`.

## Limites da Meta

`lib/meta-limits.ts`:

### Tier de mensagens (usuários únicos iniciados por 24h)

| Tier | Limite |
| --- | --- |
| `TIER_250` | 250/dia — conta nova |
| `TIER_1K` | 1.000/dia |
| `TIER_2K` | 2.000/dia |
| `TIER_10K` | 10.000/dia |
| `TIER_100K` | 100.000/dia |

O tier sobe automaticamente conforme volume e qualidade. Não há como forçar.

### Throughput

`STANDARD` ou `HIGH` (até 1.000 mensagens/segundo, upgrade automático quando elegível).

### Limite de par

1 mensagem a cada 6 segundos para o **mesmo** destinatário. Violar gera `131056`. Isso
importa quando campanha e fluxo acertam o mesmo contato ao mesmo tempo.

### Qualidade

`QualityScore` por número (verde/amarelo/vermelho). Qualidade baixa derruba o tier e pode
bloquear o número. É por isso que a supressão automática existe: insistir em número
inválido queima a reputação.

## Saúde da conta

`lib/account-health.ts` → `checkAccountHealth()`, `quickHealthCheck()`,
`getHealthSummary()`. Alimenta `/api/health`, o dashboard e `account_alerts`.

Alertas aparecem sozinhos (ex.: `131042` de pagamento) e se dispensam quando uma entrega
volta a funcionar.

## Erros da Cloud API

`lib/whatsapp-errors.ts` mapeia **54 códigos**:

```typescript
mapWhatsAppError(131042)   // { category: 'payment', message, action }
isPaymentError(code)
isRateLimitError(code)
isRetryableError(code)
isCriticalError(code)      // pagamento, autenticação
isOptOutError(code)        // o usuário bloqueou o negócio
getUserFriendlyMessage(code)
getRecommendedAction(code)
```

Os mais comuns:

| Código | O que é | O que fazer |
| --- | --- | --- |
| `131042` | Problema de pagamento na conta | Regularizar o método de pagamento na Meta |
| `131026` | Mensagem não entregável | Número inválido/sem WhatsApp → supressão automática |
| `131056` | Limite de par (1 msg/6s) | Reduzir throttle; checar campanha + fluxo no mesmo contato |
| `133005` | PIN incorreto no registro | PIN antigo do número — ver diagnóstico Meta |
| `133006` | Número não verificado | Verificar propriedade do número |
| `10033` | Mensagem duplicada | Deduplicação; há um simulador em `/api/meta/diagnostics/simulate-10033` |

Falhas ficam em `campaign_contacts` com diagnóstico completo: `failure_code`,
`failure_title`, `failure_details`, `failure_fbtrace_id`, `failure_subcode`, `failure_href`.
O `fbtrace_id` é o que a Meta pede ao abrir suporte.

## Webhook

### Assinatura

`/api/webhook` e `/api/flows/endpoint` têm política `public_route_auth`: a rota verifica o
chamador. A assinatura `X-Hub-Signature-256` é validada com o App Secret
(`META_APP_SECRET` ou configurações; a env tem precedência).

Enquanto nenhuma assinatura válida tiver chegado, a verificação fica em **`report_only`**:
aceita e registra, para não quebrar a integração durante a configuração. Depois da primeira
assinatura válida passa a ser exigida — e o Diagnóstico da Meta avisa quando o App Secret
sumiu. `META_WEBHOOK_REQUIRE_SIGNATURE=true` fecha desde o começo.

### Deduplicação

A Meta reentrega webhooks. `processed_inbound_messages` + `process_inbound_message()`
garantem processamento único — sem isso o agente de IA responde duas vezes à mesma mensagem.

### Status que não chegam

`whatsapp_status_events` guarda os eventos recebidos. O que não casou com uma mensagem na
hora é reconciliado pelo tick (`reconcilePendingStatusEvents`) ou manualmente:

```bash
curl -X POST https://seu-app.vercel.app/api/webhook/reconcile-status-events \
  -H "Authorization: Bearer $DISPARA_API_KEY"
```

### Diagnóstico

| Rota | O que mostra |
| --- | --- |
| `/api/webhook/info` | O que está registrado |
| `/api/webhook/validate` | Testa a configuração |
| `/api/meta/webhooks/subscription` | Assinatura da WABA |
| `/api/debug/webhook/test` | Simula um payload |

## Número pendente

Número em `PENDING` não envia. `/settings/meta-diagnostics` consulta os campos de estado e
aponta o que falta: verificação de propriedade, registro com PIN, assinatura do webhook.
A API correspondente é `/api/meta/diagnostics`.

## Endpoints de diagnóstico

| Rota | Para quê |
| --- | --- |
| `/api/health` | Health check (público) |
| `/api/system` | Info do sistema (público) |
| `/api/account/limits` | Tier, throughput, qualidade |
| `/api/account/alerts` | Alertas ativos |
| `/api/usage` | Uso |
| `/api/debug/ai-logs` | Respostas da IA |
| `/api/debug/campaign-contacts/[id]` | Estado de um contato na fila |
| `/api/debug/campaigns/[id]/audit` | Auditoria da campanha |
| `/api/debug/supabase-tables` | Tabelas e contagens |
| `/api/debug/meta/template-analytics` | Analytics de template na Meta |
| `/api/debug/mem0` | Estado da memória |

## Checagem do banco

```bash
npm run db:check              # aplica as migrações num Postgres 17 (PGlite) e verifica
npm run db:check -- --verify-only   # somente leitura
```

Verifica triggers, disparo de broadcast, RPCs e privilégios. Roda no CI. É o que impede uma
migração nova de reabrir a leitura anônima sem ninguém notar.

## Comportamentos conhecidos

- **Flash-back de cache de borda**: item excluído pode reaparecer por alguns segundos — TTL
  de 10s do cache da Vercel. Não é perda de dado.
- **Clientes Supabase nulos**: `getSupabaseAdmin()` e `getSupabaseBrowser()` retornam `null`
  sem env vars, para o wizard rodar. Todo caller trata o `null`.
- **Alertas de pagamento**: aparecem no `131042` e se dispensam quando a entrega volta.
- **Cache de credenciais**: 60s em processo. Trocar o token na UI leva até um minuto para
  valer em todas as instâncias.
- **Cache de sessões**: ~15s no proxy. Revogar uma sessão leva até esse tempo para valer.
- **503 em vez de 401**: com o banco fora, o proxy responde 503 a credencial de dono ou
  atendente que não consegue verificar — um 401 faria a PWA do atendente apagar o cookie a
  cada oscilação.
- **Canal `dispara-db` é público**: quem tem a chave publishable pode ouvir e emitir nele.
  Por isso o payload só carrega ids, status e contadores, e o front o trata como sinal de
  invalidação — nunca como dado.

## Observabilidade de LLM

Helicone (Configurações → IA) para custo, latência e cache. `ai_agent_logs` para o
detalhe por resposta, incluindo fontes do RAG e tool calls.
