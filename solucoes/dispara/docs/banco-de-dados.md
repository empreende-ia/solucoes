# Banco de dados

PostgreSQL no Supabase, sem ORM. As queries vivem em `lib/supabase-db.ts` (CRUD fino) e em
funções SQL chamadas por `rpc()`.

## Migrações

Em `supabase/migrations/`, aplicadas por ordem de nome de arquivo. O installer roda todas de
uma vez; manualmente, aplique na ordem.

| Arquivo | O que traz |
| --- | --- |
| `00000000000000_init.sql` | Schema base: settings, campanhas, contatos, templates, inbox, IA, flows |
| `20260204000000_add_agent_reaction_quote_settings.sql` | Permissões de reagir/citar do agente |
| `20260225000001_fix_nested_tags_and_stats.sql` | Correção de tags aninhadas e estatísticas |
| `20260225000002_add_get_contact_tag_counts.sql` | `get_contact_tag_counts()` |
| `20260416000000_add_ab_testing.sql` | Teste A/B de campanha (variante + split) |
| `20260422000000_add_campaign_auto_replies.sql` | Respostas automáticas de campanha |
| `20260430000000_add_inbox_message_source_type.sql` | Origem da mensagem no inbox |
| `20260705000000_workflow_tree.sql` | Árvore de workflow, versões, execuções |
| `20260705000100_cron_infra.sql` | **pg_cron + pg_net + `dispara_cron_tick()`** |
| `20260705000200_workflow_schedule_cols.sql` | Agendamento de workflow |
| `20260705000300_workflow_enrollments.sql` | Waits duráveis (`resume_at`, CAS) |
| `20260705000400_processed_inbound_messages.sql` | Deduplicação de mensagens recebidas |
| `20260705000500_ai_inbox_postgres.sql` | Locks e processamento de IA no Postgres |
| `20260705000600_campaign_queue.sql` | Fila de disparo: `claim_campaign_batch()`, lease |
| `20260705000700_drop_qstash_columns.sql` | Remoção do resíduo do QStash |
| `20260709000000_ghl_parity.sql` | Settings de workflow, listas de contatos, CRM |
| `20261011000000_security_hardening.sql` | **Fecha leitura anônima, fecha as RPCs, realtime por broadcast** |

Há também `CHANGELOG_V2.md` e `WIZARD_GUIDE.md` na pasta, e um `_archive/` com migrações
antigas que não entram na aplicação.

## Tabelas (45)

### Configuração

| Tabela | Papel |
| --- | --- |
| `settings` | Chave-valor: credenciais, marca, flags, chaves do Flow Endpoint. Cache de 60s em processo |
| `account_alerts` | Alertas de saúde da conta (pagamento, qualidade, limite) |

### Campanhas

| Tabela | Papel |
| --- | --- |
| `campaigns` | Metadados + contadores (sent/delivered/read/failed) + config de A/B |
| `campaign_contacts` | **A fila.** Um contato por linha, com status próprio e diagnóstico de falha |
| `campaign_folders` | Pastas de organização |
| `campaign_tags` / `campaign_tag_assignments` | Tags e vínculo |
| `campaign_trace_events` | Linha do tempo de eventos da campanha |
| `campaign_batch_metrics` / `campaign_run_metrics` | Métricas por lote e por execução |

### Contatos

| Tabela | Papel |
| --- | --- |
| `contacts` | Contato + tags + `custom_fields` (jsonb) |
| `contact_lists` | Filtros salvos com membros dinâmicos (smart list) |
| `custom_field_definitions` | Definição dos campos customizados |
| `phone_suppressions` | Números bloqueados para disparo, com TTL |

### WhatsApp

| Tabela | Papel |
| --- | --- |
| `templates` | Cache dos templates sincronizados da Meta |
| `template_projects` / `template_project_items` | Projetos de template e seus itens |
| `whatsapp_status_events` | Eventos de status recebidos, para reconciliação |
| `processed_inbound_messages` | Deduplicação: a Meta reentrega webhooks |

### Inbox

| Tabela | Papel |
| --- | --- |
| `inbox_conversations` | Conversa: status, modo bot/humano, prioridade, não lidas, sentimento |
| `inbox_messages` | Mensagens, incluindo notas internas |
| `inbox_labels` / `inbox_conversation_labels` | Etiquetas e vínculo |
| `inbox_quick_replies` | Respostas rápidas |
| `attendant_tokens` | Acesso de atendente por token, com permissões e validade |

### IA

| Tabela | Papel |
| --- | --- |
| `ai_agents` | Agente: prompt, modelo, RAG, handoff, permissões de ferramenta |
| `ai_agent_logs` | Log por resposta: entrada, saída, tokens, fontes, tool calls |
| `ai_knowledge_files` | Arquivos da base de conhecimento e status de indexação |
| `ai_embeddings` | Vetores (pgvector) |
| `ai_processing_locks` | Lock para não responder duas vezes à mesma mensagem |

### Workflows

| Tabela | Papel |
| --- | --- |
| `workflows` | Definição + `settings` (allowReentry, stopOnResponse, timeWindow) |
| `workflow_versions` | Versionamento, base do rollback |
| `workflow_runs` / `workflow_run_logs` | Execuções e logs |
| `workflow_builder_executions` / `workflow_builder_logs` | Execuções do builder |
| `workflow_enrollments` | **Waits duráveis**: `resume_at` + CAS |
| `workflow_conversations` | Estado da conversa dentro do fluxo |

### Flows e formulários

| Tabela | Papel |
| --- | --- |
| `flows` | Definições de WhatsApp Flow (MiniApps) |
| `flow_submissions` | Submissões recebidas |
| `lead_forms` | Formulários de captação públicos |

### CRM

| Tabela | Papel |
| --- | --- |
| `pipelines` / `pipeline_stages` | Pipeline e etapas |
| `opportunities` | Oportunidade: 1 pipeline + 1 etapa, valor, status, contato |

### Outros

| Tabela | Papel |
| --- | --- |
| `push_subscriptions` | Inscrições de web push (PWA) |

## Enums do domínio

Em `types.ts`:

```typescript
CampaignStatus:   DRAFT | SCHEDULED | SENDING | COMPLETED | PAUSED | FAILED
ContactStatus:    OPT_IN | OPT_OUT | UNKNOWN
MessageStatus:    (status de mensagem da Cloud API)
TemplateCategory: 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO'
TemplateStatus:   'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED'
ConversationStatus:   'open' | 'closed'
ConversationMode:     'bot' | 'human'
ConversationPriority: 'low' | 'normal' | 'high' | 'urgent'
DeliveryStatus:   'pending' | 'sent' | 'delivered' | 'read' | 'failed'
Sentiment:        'positive' | 'neutral' | 'negative' | 'frustrated'
FlowTriggerType:  'none' | 'keywords' | 'campaign_reply'
```

Status de `campaign_contacts` (texto, não enum): `pending`, `sending`, `sent`, `delivered`,
`read`, `failed`, `skipped`.

## A fila de disparo

`campaign_contacts` é a fila. O claim de um lote é `claim_campaign_batch()`:

```sql
claim_campaign_batch(
  p_campaign_id   text,
  p_limit         int,
  p_trace_id      text   default null,
  p_worker        text   default null,
  p_lease_seconds int    default 600
) returns setof campaign_contacts
```

É um **CAS com lease**: faz `UPDATE ... SET status='sending', lease_until = now() + lease`
nas linhas `pending` e devolve só as que conseguiu marcar. Duas invocações concorrentes
nunca pegam o mesmo contato. O `lease_until` permite que `reap_stuck_campaign_sending()`
devolva à fila o que ficou `sending` além do prazo (invocação morta no meio).

Há também `try_lock_campaign_dispatch()` / `release_campaign_dispatch_lock()` para garantir
um disparo por campanha de cada vez.

## Funções SQL (27)

Agrupadas por propósito:

**Relógio** — `dispara_cron_tick()`

**Fila de disparo** — `claim_campaign_batch()`, `try_lock_campaign_dispatch()`,
`release_campaign_dispatch_lock()`, `reap_stuck_campaign_sending()`,
`update_campaign_dispatch_metrics()`, `increment_campaign_stat()`,
`increment_campaign_auto_reply_counters()`, `get_campaign_contact_stats()`

**Contatos** — `get_contact_stats()`, `get_contact_tags()`, `get_contact_tag_counts()`,
`bulk_update_contact_tags()`, `bulk_delete_contacts()`

**Inbox** — `process_inbound_message()`, `increment_conversation_counters()`,
`decrement_unread_count()`, `reset_unread_count()`

**IA** — `search_embeddings()`, `get_agent_config()`, `ensure_default_ai_agent()`

**Agregação** — `get_dashboard_stats()`, `get_campaigns_with_all_tags()`

**Infra** — `update_updated_at_column()`, `update_campaign_folders_updated_at()`,
`update_attendant_tokens_updated_at()`, `analyze_table()`

## Segurança do banco

A migração `20261011000000_security_hardening.sql` (outubro de 2026) mudou o modelo de
acesso. Antes dela, o `init` criava policies `FOR SELECT TO anon USING (true)` em
`campaigns`, `contacts`, `templates`, `flows`, `inbox_conversations`, `inbox_messages` e
`account_alerts`. Como a chave publishable (role `anon`) vai no bundle do browser,
qualquer pessoa conseguia `GET /rest/v1/contacts`.

O que a migração fez:

### 1. Leitura anônima fechada

`anon` e `authenticated` perderam **todo** privilégio em **todas** as tabelas, views e
sequences de `public` — por inventário dinâmico, não lista manual — e as policies foram
removidas. O app não usa Supabase Auth: todo acesso legítimo é service role no servidor
(rotas de API, server actions, `lib/supabase-server.ts`), com a autorização feita pelo
`proxy.ts`.

### 2. RPCs fechadas

Funções `SECURITY DEFINER` (`claim_campaign_batch`, `reap_stuck_campaign_sending`,
`try_lock_campaign_dispatch`, `dispara_cron_tick`...) eram executáveis por `anon` via
`/rest/v1/rpc/*`. O `EXECUTE` foi revogado de `PUBLIC`/`anon`/`authenticated` em todas as
funções de `public`, inclusive nas futuras (default privileges). Só `service_role` manteve
`EXECUTE`. Toda `SECURITY DEFINER` sem `search_path` fixo ganhou um.

### 3. Realtime por broadcast

O realtime do dashboard usava `postgres_changes` com a chave `anon` — que dependia
exatamente das policies removidas. Agora a trigger `dispara_broadcast_change` publica no
canal público `dispara-db` (evento `db_change`) um payload com **só colunas não
sensíveis**: ids, status, contadores, timestamps.

> **Nunca inclua PII nesse payload** — nome, telefone, e-mail, conteúdo de mensagem,
> `custom_fields`. Quem tem a chave publishable pode ouvir **e emitir** nesse canal.

O frontend usa o evento como sinal de invalidação e busca os dados reais pelas APIs
autenticadas. Como cada evento vira uma linha em `realtime.messages`, o volume é contido na
trigger — `campaign_contacts` não publica nada, `campaigns` limita contadores a 1× a cada
2s, `contacts` usa trigger por STATEMENT. Os detalhes por tabela estão comentados no topo
da própria migração.

### RLS

RLS continua habilitado nas tabelas, sem policy para `anon`. Como o produto é single-tenant,
RLS aqui não separa clientes (isso é separação de deploy) — ela é a segunda barreira caso a
chave publishable vaze.

### Verificação

```bash
npm run db:check    # aplica as migrações num Postgres 17 (PGlite) e verifica
```

Roda também no CI. O harness cobre triggers, disparo real, RPCs e tem modo `--verify-only`
somente leitura.

## Convenções

- IDs são `text` com prefixo legível (`cc_`, `camp_`, ...), gerados por `DEFAULT` com
  `uuid_generate_v4()` sem hífens — não `uuid` nativo.
- Timestamps são `timestamp with time zone`.
- Dados flexíveis em `jsonb` (`custom_fields`, `settings` de workflow, snapshots de
  template).
- `updated_at` mantido por trigger (`update_updated_at_column()`).
