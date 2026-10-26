# Lara · SDR com IA — Empreende.IA

Agente de SDR conversacional para **WhatsApp** e **Instagram Direct**. A Lara atende,
qualifica, agenda reuniões, move os deals no pipeline e responde com base no
conhecimento do negócio — sem inventar informação.

> Solução do catálogo [Soluções Empreende.IA](../../README.md). Repositório de origem:
> [henriquegabriel-ia/lara-empreende-ia](https://github.com/henriquegabriel-ia/lara-empreende-ia).

## O que o cliente recebe

| Área | O que faz |
| --- | --- |
| **Visão geral** | Indicadores do período: conversas atendidas, qualificação, agendamentos, saúde do sistema e o que falta para ir ao ar. |
| **Pipeline** | Kanban de deals. As etapas intermediárias são gerenciadas pela IA, com critério em texto por etapa; ganho e perdido ficam com a pessoa. |
| **Conversas** | Histórico de WhatsApp e Instagram no mesmo lugar, com anexos, áudio transcrito e o que a agente decidiu em cada passo. |
| **Contatos** | Base de leads com tags, histórico e drawer de detalhe. |
| **Agenda** | Agendamentos criados pela agente em Google, Outlook ou iCloud (via Nylas), com remarcação e cancelamento. |
| **Equipe** | Convite de acesso, papéis e funções do time. |
| **Configurações → Agente** | Identidade, processo comercial, conhecimento, ações, situações de teste, publicação e histórico de versões. |

## Stack

- **Front** — Vite + React 18 + TypeScript + Tailwind, no design system Empreende.IA
  (ponte de tokens em `src/index.css`, guia em [docs/design-tokens.md](docs/design-tokens.md)).
  Deploy na **Vercel**: push na `main` publica.
- **Backend** — Supabase: Postgres com RLS, Vault, `pg_cron` e **24 Edge Functions** em
  Deno. 88 migrations em `supabase/migrations/`.
- **IA** — OpenAI (chat e transcrição de áudio) com loop de ferramentas real em
  `supabase/functions/_shared/lara-engine.ts`. Anthropic disponível como provedor
  alternativo na aba Comportamento.
- **Canais** — Meta WhatsApp Cloud API (direta) e **Zernio** (WhatsApp por coexistência
  + Instagram DM) — ver [docs/zernio-api.md](docs/zernio-api.md).
- **Agenda** — Google, Outlook e iCloud via Nylas v3, com criar, editar, remarcar e
  cancelar — ver [docs/nylas-calendar.md](docs/nylas-calendar.md).

## Fluxo de mensagens

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

Detalhe de cada peça em [docs/arquitetura.md](docs/arquitetura.md).

## Como a agente evita inventar

1. **Fatos canônicos** (`knowledge_facts`): verdades verbatim — preço, link, horário —
   injetadas em todo prompt. Fato crítico nasce pendente e exige confirmação humana.
2. **Base de conhecimento** (`knowledge_documents` → chunks): busca híbrida full-text
   em português + trigram, exposta como ferramenta `buscar_conhecimento` e consultada
   antes de qualquer resposta factual.
3. **Regra de verdade no prompt**: sem informação encontrada, não completa — registra
   em `unanswered_questions` e diz que vai confirmar.
4. **Simulação segura**: o rascunho pode ser conversado e avaliado sem executar ação
   real.
5. **Situações de teste**: regras críticas, ações, handoff e opt-out geram casos
   automáticos; o operador cria os próprios cenários.
6. **Publicação governada**: erro crítico, instabilidade e falha técnica bloqueiam;
   alerta exige aceite consciente. Cada publicação cria versão imutável.

## Configuração e publicação governadas

Configurações → Agente é a única interface de configuração. O runtime lê exclusivamente
`agent_versions`, pela referência `agents.published_version_id` — nunca o rascunho. O
prompt é compilado de forma determinística e fica somente leitura. A avaliação
`lara-eval` usa um snapshot do rascunho, simula ferramentas, repete os cenários
críticos e classifica cada resultado; uma publicação só aceita rodada concluída da
mesma revisão. Versões anteriores podem ser restauradas em um novo rascunho.

O aprendizado assistido analisa conversas apenas quando solicitado, remove
identificadores da evidência e salva sugestões pendentes. Nenhuma sugestão altera fato,
rascunho ou produção sem revisão humana.

Ciclo completo em [docs/agent-configuration.md](docs/agent-configuration.md).

## Rodar local

```sh
bun install
bun dev          # http://localhost:8080
bun run build
bun run test     # 22 suítes Vitest
```

`.env` não vai no repositório. As três variáveis são públicas (entram no bundle):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

## Deploy

- **Front (Vercel)** — push na `main`, com as três variáveis configuradas no projeto.
- **Backend (Supabase CLI)** — `supabase link --project-ref <ref>` →
  `supabase db push` → `supabase functions deploy`. Quatro functions ficam públicas em
  `supabase/config.toml` (`verify_jwt = false`) porque validam a requisição por conta
  própria: `whatsapp-webhook`, `zernio-webhook`, `zernio-media` e `nylas-calendar`.

Secrets, bootstrap de ambiente novo, rotinas automáticas e diagnóstico:
[docs/operacao.md](docs/operacao.md).

## Material comercial

O deck de apresentação da solução, no design system Empreende.IA, está em
[`apresentacao/`](apresentacao) — PDF de 13 páginas pronto para enviar a cliente, mais
a fonte HTML para gerar de novo depois de editar.

## Documentação

Índice comentado em [docs/README.md](docs/README.md).

| Arquivo | Assunto |
| --- | --- |
| [docs/arquitetura.md](docs/arquitetura.md) | Camadas, fluxo, functions, tabelas, ferramentas, isolamento |
| [docs/operacao.md](docs/operacao.md) | Deploy, secrets, rotinas, saúde, troubleshooting |
| [docs/agent-configuration.md](docs/agent-configuration.md) | Ciclo governado de configuração e publicação |
| [docs/agent-configuration-scope-audit.md](docs/agent-configuration-scope-audit.md) | Auditoria do escopo contra a especificação |
| [docs/plano-de-testes.md](docs/plano-de-testes.md) | Plano dos testes automatizados |
| [docs/zernio-api.md](docs/zernio-api.md) | API Zernio (WhatsApp coex + Instagram) |
| [docs/whatsapp-templates.md](docs/whatsapp-templates.md) | Templates da Meta Cloud API |
| [docs/nylas-calendar.md](docs/nylas-calendar.md) | Agenda via Nylas v3 |
| [docs/design-tokens.md](docs/design-tokens.md) | Design system Empreende.IA no painel |
