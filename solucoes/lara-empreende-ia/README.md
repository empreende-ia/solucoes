# Lara · SDR com IA — Empreende.IA

Agente de SDR conversacional para **WhatsApp** e **Instagram**. A Lara qualifica leads, agenda reuniões, move deals no pipeline e responde com base no conhecimento do negócio — sem inventar informação.

## Stack

- **Front**: Vite + React 18 + TypeScript + Tailwind (design system Empreende.IA — ponte de tokens em `src/index.css`, guia em `docs/design-tokens.md`). Deploy na **Vercel** (push na `main` = deploy).
- **Backend**: Supabase — Postgres + RLS + Edge Functions (Deno). Migrations em `supabase/migrations/`, deploy via CLI (`supabase db push` + `supabase functions deploy`).
- **IA**: OpenAI (chat + transcrição de áudio) com loop de ferramentas real (`supabase/functions/_shared/lara-engine.ts`); Anthropic disponível como provedor alternativo na aba Comportamento.
- **Canais**: Meta WhatsApp Cloud API (direta) e **Zernio API** (WhatsApp por coexistência + Instagram DM) — referência em `docs/zernio-api.md`
- **Agenda**: Google/Outlook/iCloud via Nylas v3, com criação, edição, reagendamento e cancelamento — referência em `docs/nylas-calendar.md`

## Como a agente reduz invenções

1. **Fatos canônicos** (`knowledge_facts`): verdades verbatim (preço, link, horário) injetadas em todo prompt.
2. **Base de conhecimento** (`knowledge_documents` → chunks): busca híbrida full-text (português) + trigram exposta como ferramenta `buscar_conhecimento` — a Lara consulta antes de responder qualquer pergunta factual.
3. **Regras de verdade** no prompt: sem informação encontrada → não inventa; registra em `unanswered_questions` (`registrar_duvida`) e diz que vai confirmar.
4. **Simulação segura**: o rascunho pode ser conversado e avaliado sem executar ações reais.
5. **Situações de teste**: regras críticas, ações, handoff e opt-out geram testes automáticos; o operador também cria cenários próprios.
6. **Publicação governada**: erros críticos, instabilidade e falhas técnicas bloqueiam; alertas exigem aceite consciente.

## Fluxo de mensagens

```
WhatsApp Cloud:  Meta → whatsapp-webhook → message_grouping_queue → message-grouper ┐
Zernio (coex/IG): Zernio → zernio-webhook (HMAC + dedup + debounce) ────────────────┼→ lara_processing_queue
                                                                                    ┘
lara-orchestrator (lara-engine: fatos + busca + tools) → send_queue → whatsapp-sender
                                                       (roteia Meta Cloud ou Zernio API por conversa)
```

## Configuração

1. **Zernio**: Configurações → APIs → salvar a API key (`sk_…` de zernio.com → Settings → API Keys) → Canais → Conectar WhatsApp (coexistência: o app continua funcionando) → Sincronizar contas. O webhook é registrado automaticamente.
2. **Cloud API manual** (alternativa): Configurações → APIs.
3. **Agente**: Configurações → Agente centraliza identidade, vendas, conhecimento, ações, situações de teste, publicação e histórico. Toda edição é autosalva no rascunho; a versão ativa continua atendendo.
4. **Agenda (Nylas)**: Configurações → Agenda → Conectar. O setup e os secrets necessários estão em `docs/nylas-calendar.md`.
5. Secrets no Supabase (`supabase secrets set`): `OPENAI_API_KEY` (motor de IA e transcrição de áudio; também pode ser informada na aba APIs) e, se for usar agenda, `NYLAS_CLIENT_ID`/`NYLAS_API_KEY`. Credenciais de canal (Zernio, Meta, ElevenLabs) são digitadas na interface e ficam em `lara_settings`.

## Configuração e publicação governadas

Configurações → Agente trabalha com uma configuração estruturada e compila o prompt
como artefato somente leitura. A avaliação `lara-eval` usa um snapshot do rascunho,
simula ferramentas, repete cenários críticos e classifica cada resultado. Uma publicação
só aceita uma rodada concluída da mesma revisão do rascunho. Cada publicação cria uma
versão imutável, e versões anteriores podem ser restauradas em um novo rascunho.

O aprendizado assistido analisa conversas somente quando solicitado, remove identificadores
comuns da evidência e salva sugestões pendentes. Nenhuma sugestão altera fatos, rascunho
ou produção sem revisão humana.

Detalhes de arquitetura, deploy e validação estão em `docs/agent-configuration.md`.

## Desenvolvimento

```sh
bun install
bun dev        # http://localhost:8080
bun run build
```

## Deploy

- **Front (Vercel)**: push na `main` publica. Env vars do projeto: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- **Backend (Supabase CLI)**: `supabase link --project-ref <ref>` → `supabase db push` (migrations) → `supabase functions deploy` (as 23 functions; `supabase/config.toml` mantém os 4 webhooks públicos com `verify_jwt = false`).

## Novo ambiente / bootstrap

O projeto se auto-configura: as edge functions replicam `SUPABASE_URL` e a service role key do próprio ambiente para o Vault (RPC `ensure_edge_secrets`, chamada no primeiro signup e a cada execução do orchestrator), e os cron jobs de varredura leem de lá — nada de URL ou chave hardcoded. **O primeiro signup vira admin** e dispara o `initialize-system` (seeds + Vault); depois disso, desligue o signup público no dashboard do Supabase.
