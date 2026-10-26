# Agenda via Nylas (Google, Outlook e iCloud)

O vínculo de agenda do cliente é feito pelo Nylas v3 (Hosted OAuth): um único
fluxo cobre Google, Outlook e iCloud. Os tokens do provedor ficam no Nylas; o
sistema guarda apenas o `grant_id` em `calendar_integrations` (provider
`nylas`). É a única integração de agenda do sistema.

## Setup no dashboard Nylas

1. Crie uma aplicação em https://dashboard-v3.nylas.com (escolha a região US ou
   EU — ela define a API URI).
2. Em Hosted Authentication, registre o callback:
   `https://<PROJECT_REF>.supabase.co/functions/v1/nylas-calendar`
3. Habilite os provedores desejados (Google exige conectar um Google Cloud
   project próprio no dashboard do Nylas; Microsoft e iCloud seguem os guias da
   Nylas).

## Secrets das Edge Functions

```bash
supabase secrets set NYLAS_CLIENT_ID=... NYLAS_API_KEY=... NYLAS_API_URI=https://api.us.nylas.com
```

`NYLAS_API_URI` é opcional (default US). Use `https://api.eu.nylas.com` para
aplicações na região EU.

## Deploy

A function tem `verify_jwt = false` no `config.toml` (o callback do Hosted
OAuth chega sem Authorization; o state de uso único em `calendar_oauth_states`
e o gate de admin nas ações POST fazem a proteção). Migration
`20260814120000_nylas_calendar_provider.sql` antes do deploy da function.

## Comportamento

- Ações: `status`, `connect`,
  `update_settings`, `sync_all`, `sync_event`, `delete_event`, `disconnect`.
- `status` nunca falha por ambiente incompleto: ele relata. Além do estado da
  conexão, devolve `configured` (credenciais presentes **e** migration
  aplicada), `missingConfig` com o que falta, e `providers` — a lista lida de
  `GET /v3/connectors`, ou seja, os provedores realmente habilitados na conta
  Nylas. É o que permite à tela separar "ninguém conectou ainda" de "esta
  instalação não tem a integração de pé", em vez de desenhar um "não conectada"
  saudável em cima de uma falha.
- `connect` aceita `provider` (pula o seletor do Nylas e vai direto ao provedor
  escolhido na nossa tela) e `loginHint` (reautentica o grant existente daquele
  e-mail em vez de criar outro). Omitir `provider` mantém o comportamento
  antigo: o Nylas apresenta os connectors habilitados.
- A interface só oferece provedor que veio em `providers`. Quando a consulta aos
  connectors não responde, ela mostra um botão único e deixa a escolha com o
  Nylas — melhor do que prometer Outlook onde não há connector.
- iCloud exige senha específica de app gerada pelo usuário em appleid.apple.com;
  a senha normal da conta não funciona. A tela mostra as instruções antes de
  abrir a janela de autorização.
- Sync one-way: o sistema é a fonte da verdade; a agenda externa é espelho.
  Disponibilidade continua sendo verificada só na tabela `appointments`.
- Idempotência: o Nylas não aceita id de evento escolhido pelo cliente; o
  retry procura o evento pela chave reservada `metadata.key1` (a única
  pesquisável via `metadata_pair` no Nylas v3) antes de criar, e um claim
  atômico em `appointments.calendar_sync_status` impede syncs simultâneos.
- Sala de reunião automática (`create_meet`): Google Meet em grants Google,
  Teams em grants Microsoft; omitida em provedores sem sala nativa (iCloud).
- Horários: `appointments.date/time` são wall-clock no fuso da integração; a
  conversão para epoch acontece só na montagem do evento
  (`_shared/nylas-events.ts`), preservando a semântica do validador.
- `disconnect` revoga o grant no Nylas (best-effort) e marca os agendamentos
  como `not_connected`.

## A janela de autorização

O consentimento passa por `accounts.google.com` e `login.microsoftonline.com`,
que servem `Cross-Origin-Opener-Policy`. Depois disso `window.opener` vira
`null` de forma permanente e `popup.closed` passa a responder `true` com a
janela ainda aberta. Consequência prática: `postMessage` e `popup.closed` não
são canais confiáveis para saber se a conexão deu certo.

Por isso a tela trata o `postMessage` do callback como caminho rápido — com
validação de `event.origin`, recusando a mensagem se a origem esperada não for
conhecida — e usa uma consulta de `status` a cada 2 segundos como o canal que
realmente decide. `popup.closed` não é consultado em momento nenhum: ele mente
depois do COOP.

O teto de observação é de 10 minutos, alinhado ao `expires_at` do
`calendar_oauth_states`. Um teto menor faria a tela decretar falha enquanto o
servidor ainda aceitaria a autorização — o caso de quem para para gerar a senha
de app do iCloud ou faz verificação em duas etapas. Ao estourar, a tela para de
verificar sozinha mas não declara fracasso: mantém "Já autorizei, verificar" e
a tentativa continua válida até o usuário descartá-la.

O sucesso é reconhecido por **mudança** da conexão, não por presença
(`connectionSignature` em `src/services/calendar.ts`). Reconexão e migração do
Google legado partem de `connected: true`, então esperar que a conexão exista
daria sucesso instantâneo, antes de a pessoa escolher a conta.

A janela é aberta com nome único por tentativa. Com nome fixo,
`window.open('', nome)` devolve uma janela anterior **sem navegar até ela**, e
escrever no DOM dessa janela cross-origin lança `SecurityError`.
