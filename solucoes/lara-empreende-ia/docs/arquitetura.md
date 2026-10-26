# Arquitetura da Lara

Mapa técnico da solução. Números conferidos sobre o código desta pasta:
**24 edge functions** (mais 16 módulos compartilhados), **88 migrations**,
**42 tabelas**, **43 tabelas com RLS habilitado e 105 políticas**, **22 suítes Vitest**
e **10 testes SQL transacionais**.

## Camadas

```
┌─ Painel (Vite + React 18 + TS + Tailwind) ──────────── Vercel ─────────────┐
│  /dashboard  /pipeline  /chat  /contacts  /scheduling  /team  /settings    │
└───────────────────────────── supabase-js (JWT do usuário) ─────────────────┘
┌─ Supabase ────────────────────────────────────────────────────────────────┐
│  Postgres + RLS  ·  Vault (segredos de runtime)  ·  pg_cron (varreduras)  │
│  24 Edge Functions em Deno  ·  Storage de anexos                          │
└───────────────────────────────────────────────────────────────────────────┘
┌─ Fora ────────────────────────────────────────────────────────────────────┐
│  OpenAI (chat + transcrição)  ·  Anthropic (provedor alternativo)         │
│  Meta WhatsApp Cloud API  ·  Zernio (WhatsApp coex + Instagram DM)        │
│  Nylas v3 (Google/Outlook/iCloud)  ·  ElevenLabs (voz, opcional)          │
└───────────────────────────────────────────────────────────────────────────┘
```

O painel **nunca** fala com os canais nem com a OpenAI direto: tudo passa por edge
function, que é onde ficam as credenciais e as regras.

## O caminho de uma mensagem

```
WhatsApp Cloud:   Meta ──► whatsapp-webhook ──► message_grouping_queue ──► message-grouper ─┐
Zernio (coex/IG): Zernio ─► zernio-webhook ───────────────────────────────────────────────── ┼─► lara_processing_queue
                            (HMAC + dedup + debounce)                                        ┘
                                                                │
                        lara-orchestrator (lara-engine: fatos canônicos + busca + tools)
                                                                │
                                              send_queue ──► whatsapp-sender
                                     (roteia Meta Cloud ou Zernio API por conversa)
```

Por que há duas etapas antes do motor: a pessoa manda três mensagens em sequência e
espera **uma** resposta. O agrupamento (`message-grouper`, com debounce no
`zernio-webhook`) junta as mensagens da mesma rajada antes de chamar o modelo — isso
reduz custo e evita a agente respondendo linha por linha.

As filas (`message_grouping_queue`, `lara_processing_queue`, `send_queue`) existem para
que nenhuma mensagem se perca quando o modelo, o canal ou a rede falham: o item fica na
fila com estado e a varredura do `pg_cron` reprocessa.

## Edge functions por responsabilidade

| Função | Papel |
| --- | --- |
| `whatsapp-webhook` | Recebe o webhook da Meta Cloud API, valida e enfileira. Público (`verify_jwt = false`). |
| `zernio-webhook` | Recebe WhatsApp por coexistência e Instagram DM da Zernio: valida HMAC-SHA256, deduplica evento e aplica debounce. Público. |
| `message-grouper` | Agrupa a rajada de mensagens do mesmo contato e promove para a fila de processamento. |
| `lara-orchestrator` | O motor em produção: monta o contexto, injeta fatos canônicos, roda o loop de ferramentas e enfileira a resposta. |
| `whatsapp-sender` | Entrega a resposta, escolhendo Meta Cloud ou Zernio conforme a conversa; registra o envio no chat. |
| `lara-simulator` | Conversa com o rascunho sem executar ação real — mesmos contratos, executores sem escrita. |
| `lara-eval` | Avaliador do golden set: roda cada caso no mesmo motor em dry-run e classifica o resultado. |
| `agent-configuration` | Leitura e escrita governadas do rascunho, compilação do prompt e publicação de versão imutável. |
| `agent-setup-assistant` | Configuração assistida: perguntas, URLs (com proteção contra SSRF) e arquivos viram proposta por seção. |
| `analyze-conversation` | Analisa conversas reais para alimentar o aprendizado assistido. |
| `prompt-insights` | Converte evidência de conversa em sugestão pendente. Nunca altera fato, rascunho ou versão publicada. |
| `nylas-calendar` | Contrato único de agenda (consultar, criar, remarcar, cancelar). Guarda só o `grant_id`; os tokens ficam no Nylas. Público com validação própria. |
| `whatsapp-templates` | Lista e sincroniza os templates aprovados na Meta. |
| `test-whatsapp-message` | Disparo de teste de mensagem pelo painel. |
| `test-elevenlabs-tts` | Teste da voz sintetizada. |
| `simulate-webhook` / `simulate-audio-webhook` | Injetam uma mensagem (texto ou áudio transcrito) como se viesse do canal, para testar o fluxo inteiro. |
| `zernio-connect` | Conecta a conta na Zernio e registra o webhook automaticamente. |
| `zernio-media` | Proxy de anexo: `<img>`/`<audio>`/`<video>` não mandam `Authorization`, então a function valida o token na query e streama a mídia. Público com validação própria. |
| `team-invite` | Única porta de entrada de usuário desde 04/09/2026: admin registra o e-mail na allowlist e a conta é criada pela Admin API. |
| `validate-setup` | Checagem de prontidão da configuração (o que falta para ir ao ar). |
| `health-check` | Estado das dependências e das filas, consumido pelo painel. |
| `initialize-system` | Bootstrap do ambiente: seeds e replicação dos segredos para o Vault. |
| `seed-appointments` | Dados de demonstração de agenda. |

Os 16 módulos de `supabase/functions/_shared/` concentram o que não pode divergir entre
produção, simulador e avaliação: `lara-engine.ts` (o loop de ferramentas),
`agent-prompt-compiler.ts` (compilação determinística do prompt), `action-policy.ts` e
`action-audit.ts` (o que a agente pode fazer e o registro do que fez), `llm.ts`,
`privacy.ts`, `rate-limit.ts`, `reply-fallback.ts`, `lead-state.ts`, `eval-checks.ts`,
`auth.ts`, `whatsapp-credentials.ts`, `whatsapp-templates.ts`, `nylas-events.ts`,
`agent-config.ts` e `system-config.ts`.

## O que a agente pode chamar

| Ferramenta | Efeito |
| --- | --- |
| `buscar_conhecimento` | Busca híbrida (full-text em português + trigram) nos chunks da base. É consultada antes de qualquer resposta factual. |
| `registrar_duvida` | Quando não encontra a informação, grava em `unanswered_questions` e avisa o lead que vai confirmar — em vez de inventar. |
| `check_availability` | Consulta a agenda conectada. |
| `create_appointment` | Agenda. Exige evidência literal de confirmação do lead. |
| `reschedule_appointment` | Remarca, com a mesma exigência de confirmação. |
| `cancel_appointment` | Cancela, com a mesma exigência de confirmação. |
| `human_handoff` | Transfere para uma pessoa e registra o motivo. |
| `register_opt_out` | Regra fixa da plataforma: pausa a conversa e marca o contato. Não é configurável. |
| `determine_deal_stage` | Move o deal no pipeline conforme o critério de cada etapa. |
| `update_memory_insights` | Atualiza o resumo de memória da conversa. |

Toda ação é idempotente e auditada em `agent_action_runs`.

## Como a solução evita invenção

1. **Fatos canônicos** (`knowledge_facts`): verdades verbatim — preço, link, horário —
   injetadas em todo prompt. Fato crítico nasce pendente e só fica ativo depois de
   confirmação humana.
2. **Base de conhecimento** (`knowledge_documents` → `knowledge_chunks`): busca híbrida
   exposta como ferramenta.
3. **Regra de verdade no prompt**: sem informação encontrada, a agente não completa —
   registra a dúvida e diz que vai confirmar.
4. **Prompt compilado determinístico**: o mesmo módulo puro roda no navegador e na edge
   function; o artefato é somente leitura.
5. **Avaliação antes de publicar**: regras críticas, ações, handoff e opt-out geram
   casos automáticos; o operador acrescenta cenários próprios.
6. **Publicação governada**: falha crítica, instabilidade ou falha técnica bloqueiam;
   alerta exige aceite explícito. Cada publicação cria versão imutável e evento de
   auditoria.

Detalhe do ciclo em [agent-configuration.md](agent-configuration.md).

## Dados, por domínio

| Domínio | Tabelas |
| --- | --- |
| Identidade e acesso | `profiles`, `user_roles`, `signup_allowlist`, `teams`, `team_members`, `team_functions`, `workspaces`, `workspace_members` |
| Agente e governança | `agents`, `agent_drafts`, `agent_versions`, `agent_audit_log`, `agent_runtime_events`, `agent_action_runs`, `agent_suggestions`, `agent_operation_rate_limits`, `prompt_versions` |
| Conhecimento | `knowledge_facts`, `knowledge_documents`, `knowledge_chunks`, `unanswered_questions` |
| Avaliação | `golden_cases`, `eval_runs`, `eval_results` |
| Conversas | `conversations`, `conversation_states`, `messages`, `contacts`, `tag_definitions` |
| Filas e canais | `message_grouping_queue`, `message_processing_queue`, `lara_processing_queue`, `send_queue`, `channel_connections`, `zernio_webhook_events` |
| Comercial | `deals`, `deal_activities`, `pipeline_stages` |
| Agenda | `appointments`, `calendar_integrations`, `calendar_oauth_states` |
| Configuração | `lara_settings` |

O pipeline padrão nasce com Novo, Qualificação, Apresentação, Negociação, Ganho e
Perdido; as etapas intermediárias são marcadas como gerenciadas pela IA e cada uma tem
o critério em texto que a agente usa para decidir a movimentação.

## Isolamento e segredos

- **RLS em tudo**: 43 tabelas com row level security e 105 políticas. Leitura e escrita
  são resolvidas por workspace; o backend escreve com service role em tabelas que o
  usuário não pode tocar diretamente.
- **Papéis**: o primeiro usuário de um ambiente novo vira admin; depois disso o papel
  vem da allowlist, e o cadastro público fica fechado.
- **Vault**: as edge functions replicam `SUPABASE_URL` e a service role key do próprio
  ambiente para o Vault (`ensure_edge_secrets`), e as varreduras do `pg_cron`
  (`lara-orchestrator-sweep`, `send-queue-sweep`) leem de lá. Nada de URL ou chave
  fixa no SQL — é isso que faz o projeto funcionar em qualquer ambiente novo.
- **Credenciais de canal** (Zernio, Meta, ElevenLabs) são digitadas na interface e
  ficam em `lara_settings`. `OPENAI_API_KEY` e os secrets do Nylas ficam nos secrets do
  Supabase.
- **Privacidade**: o aprendizado assistido redige e-mail, telefone e documento da
  evidência antes de salvar sugestão; os metadados de produto não incluem respostas,
  documentos nem dados pessoais do lead.

## Testes

- 22 suítes Vitest sobre `src/lib`, `src/domain` e `src/services` — compilação de
  prompt, regras de avaliação, política e auditoria de ação, redação de dados pessoais,
  estado do lead, fallback de resposta, agenda e conhecimento.
- 10 testes SQL transacionais em `supabase/tests/` cobrindo isolamento de workspace,
  escrita exclusiva do backend, conflito de agenda, publicação governada, revisão de
  sugestões, observabilidade imutável, rate limits, telemetria e escrita atômica de
  conhecimento.

Comandos em [operacao.md](operacao.md#verificação).
