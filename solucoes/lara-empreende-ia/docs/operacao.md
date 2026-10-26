# Operação da Lara

Runbook: subir, publicar, conferir e diagnosticar.

## Ambiente local

```sh
bun install
bun dev          # http://localhost:8080
bun run build
bun run test     # Vitest
```

O `.env` do front não vai no repositório (`.gitignore` ignora `.env*`). As três
variáveis são públicas — entram no bundle — e saem do dashboard do Supabase:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
VITE_SUPABASE_PROJECT_ID=<ref>
```

## Deploy

**Front (Vercel)** — push na `main` publica. As mesmas três variáveis precisam estar
configuradas no projeto da Vercel.

**Backend (Supabase CLI)**

```sh
supabase link --project-ref <ref>
supabase db push                 # migrations
supabase functions deploy        # as 24 functions
```

`supabase/config.toml` mantém quatro functions com `verify_jwt = false`, porque elas
validam a requisição por conta própria: `whatsapp-webhook` e `zernio-webhook` (segredo
de verificação da Meta e HMAC-SHA256 da Zernio), `zernio-media` (token na query, porque
tag de mídia não envia header) e `nylas-calendar`.

**Migration e código andam juntos.** Não aplique uma migration da sequência de
governança sem o código que a consome — a ordem exata está em
[agent-configuration.md](agent-configuration.md#ordem-de-deploy-atômico).

## Ambiente novo (bootstrap)

O projeto se autoconfigura:

1. Primeiro signup do ambiente vira **admin** e dispara o `initialize-system` (seeds +
   replicação dos segredos para o Vault).
2. As edge functions chamam `ensure_edge_secrets` a cada execução do orchestrator, o
   que mantém `SUPABASE_URL` e a service role key do Vault sempre válidos. Enquanto
   esses segredos não existem, as varreduras do `pg_cron` não fazem nada e se
   autoativam assim que o primeiro seed acontece.
3. Depois do primeiro admin, **desligue o signup público** no dashboard do Supabase. A
   partir daí a entrada é só por convite: a function `team-invite` registra o e-mail na
   allowlist e cria a conta pela Admin API (a linha da allowlist entra antes da conta,
   porque o trigger `handle_new_user` lê a allowlist para decidir o papel).

## Secrets

```sh
supabase secrets set OPENAI_API_KEY=...        # motor de IA e transcrição de áudio
supabase secrets set NYLAS_CLIENT_ID=...       # só se usar agenda
supabase secrets set NYLAS_API_KEY=...
```

Zernio, Meta e ElevenLabs **não** são secrets: o operador digita na interface
(Configurações → APIs / Canais) e os valores ficam em `lara_settings`.

## Configuração pelo painel

1. **Zernio** — Configurações → APIs: salvar a API key (`sk_…`, de zernio.com →
   Settings → API Keys). Canais → Conectar WhatsApp (coexistência: o app do cliente
   continua funcionando) → Sincronizar contas. O webhook é registrado automaticamente.
2. **Meta Cloud API** (alternativa à coexistência) — Configurações → APIs.
3. **Agente** — Configurações → Agente centraliza identidade, processo comercial,
   conhecimento, ações, situações de teste, publicação e histórico. Toda edição é
   autosalva no rascunho; a versão ativa continua atendendo até a publicação.
4. **Agenda** — Configurações → Agenda → Conectar (Nylas v3 cobre Google, Outlook e
   iCloud em um único fluxo). Setup em [nylas-calendar.md](nylas-calendar.md).

## Rotinas automáticas

| Rotina | O que faz |
| --- | --- |
| `lara-orchestrator-sweep` (pg_cron) | Reprocessa a fila de processamento quando um item ficou parado. |
| `send-queue-sweep` (pg_cron) | Reenvia o que não saiu do `send_queue`. |
| Debounce do `zernio-webhook` | Espera a rajada terminar antes de promover a conversa. |
| `message-grouper` | Junta as mensagens da rajada em uma única chamada ao modelo. |

Os dois jobs leem URL e chave do Vault. Se eles pararem de funcionar depois de uma
troca de projeto, o que falta é o `ensure_edge_secrets` ter rodado uma vez.

## Conferir a saúde

- **Painel** — o card de saúde do sistema mostra identidade, prompt do agente,
  `openai_api_key`, canal de WhatsApp, ElevenLabs, horário comercial, etapas do
  pipeline, tags e times, com estado normal / alerta / erro. É a function
  `health-check`.
- **Prontidão para ir ao ar** — `validate-setup` alimenta o checklist de go-live: o que
  ainda falta configurar antes de publicar.
- **Observabilidade do agente** — Configurações → Agente → painel avançado: adoção,
  bloqueios, restaurações, tempo até a primeira publicação, falha de ferramenta e
  latência p50/p95, a partir de `agent_runtime_events` e `agent_audit_log`.

## Quando a Lara para de responder

Na ordem, do mais comum ao menos:

1. **Chegou mensagem?** `messages` e `zernio_webhook_events` (a Zernio deduplica por
   evento). Nada chegando = webhook não registrado ou HMAC inválido → reconectar o
   canal em Canais.
2. **Parou na fila?** `lara_processing_queue` e `message_grouping_queue` com item
   pendente antigo = varredura sem segredo no Vault ou orchestrator com erro.
3. **Respondeu e não saiu?** `send_queue` com item pendente = credencial do canal ou
   janela de 24h do WhatsApp fechada (aí precisa de template aprovado, ver
   [whatsapp-templates.md](whatsapp-templates.md)).
4. **Respondeu errado ou genérico?** Verifique se existe versão publicada
   (`agents.published_version_id`) — o runtime lê exclusivamente de `agent_versions`,
   nunca do rascunho. Depois, `unanswered_questions`: se estiver enchendo, falta
   conhecimento, não falta prompt.
5. **Ação não executou?** `agent_action_runs` guarda tentativa, resultado e motivo. Ação
   de agenda exige evidência literal de confirmação do lead; sem isso ela não roda — é
   comportamento esperado, não falha.

## Verificação antes de entregar

```sh
bun run test            # 22 suítes Vitest
bun run build
npx tsc --noEmit
deno check supabase/functions/<alterada>/index.ts
```

Os testes SQL de `supabase/tests/` são transacionais com rollback e rodam contra o
banco linkado.
