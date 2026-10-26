# Referência da API Zernio (integração Lara)

Consolidado da documentação oficial (docs.zernio.com) em jul/2026. Base URL: `https://zernio.com/api/v1`.

## Autenticação

- API key formato `sk_` + 64 hex (67 chars), criada em zernio.com → Settings → API Keys (exibida uma única vez).
- Header em toda requisição: `Authorization: Bearer $ZERNIO_API_KEY` + `Content-Type: application/json`.
- No projeto, a chave fica no secret `ZERNIO_API_KEY` do Supabase (nunca no front).

## Conceitos

- **Profile**: agrupa contas sociais (`GET /v1/profiles`, `POST /v1/profiles` com `{name, color?}`).
- **Account**: conta social conectada (`GET /v1/accounts`, `GET /v1/accounts/health`, `DELETE /v1/accounts/{accountId}`).

## Conectar contas (redirect flow)

`GET /v1/connect/{platform}?profileId=...&redirectUrl=...` (com Bearer) → `{ authUrl, state }`.

1. Abrir `authUrl` para o usuário (nova aba).
2. Usuário autoriza na Meta.
3. Callback: `redirectUrl?connected=whatsapp&profileId=xxx&accountId=xxx&username=+5511...`.
4. Confirmar via `GET /v1/accounts` e/ou webhook `account.connected`.

### WhatsApp — coexistência

- Platform: `whatsapp`. Durante o Embedded Signup da Meta o usuário vê a opção de **conectar a conta existente do app WhatsApp Business** (coexistência).
- Sincroniza até 6 meses de histórico; contatos importados; throughput 20 msg/s.
- Limitações coex: sem grupos via API, sem mensagens temporárias; desconexão manual no app (Settings → Account → Business Platform → Disconnect).
- Pré-requisitos: conta Meta Business; app WhatsApp Business ≥ 2.24.17.
- Alternativa headless: `POST /v1/connect/whatsapp/credentials` com `{profileId, accessToken, wabaId, phoneNumberId}` (para quem já tem Cloud API própria).

### Instagram

- Platform: `instagram`. Instagram Login for Business (OAuth), escopos `instagram_business_*` (basic, manage_messages para DM).
- Apenas contas Business/Creator.

## Inbox (unificado WhatsApp + Instagram)

### Listar conversas

`GET /v1/inbox/conversations?accountId=...&platform=...&limit=50&cursor=...`

Response: `data[]` com `id, platform, accountId, participantId, participantName, participantPicture, lastMessage, updatedTime, unreadCount, instagramProfile{isFollower,...}`; `pagination{hasMore,nextCursor}`.

### Enviar mensagem

`POST /v1/inbox/conversations/{conversationId}/messages`

Body:
- `accountId` (obrigatório)
- `message` (texto)
- `attachmentUrl` + `attachmentType` (`image|video|audio|file`) + `attachmentName`
- `voiceNote: true` → áudio como PTT (WhatsApp, OPUS .ogg)
- `quickReplies` (máx 13), `buttons` (máx 3), `interactive` (lista/CTA/Flow WhatsApp)
- `template` (fora da janela de 24h no WhatsApp)
- `replyTo` (platformMessageId para quote-reply)

Response 200: `{ success, data: { messageId, conversationId, sentAt, message } }`.

Extras: `/messages/send-typing-indicator`, `/messages/add-message-reaction`, `/messages/search-inbox-conversations`.

### Janela de 24h (WhatsApp)

Mensagem livre só até 24h após a última mensagem do cliente; fora disso exige template aprovado. Instagram DM tem janela própria da Meta (message tag `HUMAN_AGENT` disponível).

## Webhooks

### Registrar

`POST /v1/webhooks/settings` com `{ name, url, events[], secret?, isActive?, customHeaders? }` → `{ success, webhook: { _id, ... } }`.

Eventos usados pela Lara:
- `message.received` — DM/mensagem nova (WhatsApp e Instagram)
- `message.sent`, `message.delivered`, `message.read`, `message.failed`
- `conversation.started`
- `account.connected`, `account.disconnected`

**Pré-requisito (confirmado com o suporte Zernio, jul/2026):** eventos `message.*`,
`comment.received` e `review.*` exigem **Inbox access**. Sem ele, o registro retorna
`{ type: "permission_error", code: "feature_not_available" }` e a `zernio-connect` mapeia para
o code `zernio_inbox_required` com instrução em pt-BR.

Planos (jul/2026): **WhatsApp — incluindo coexistência — só existe no plano usage-based**
(não no Free legado nem nos fixos). No usage-based: 2 primeiras contas conectadas grátis para
sempre (WhatsApp, Inbox, templates e broadcasts inclusos); a partir da 3ª conta USD 6/conta/mês
(contas 1-10), USD 3 (11-100), USD 1 (101+). Número coexistence não tem taxa por número (só
números provisionados via Telnyx), mas conta como conta conectada. Instagram DM: mesmo plano
(Inbox incluso); a Zernio pode pedir **reconexão da conta Instagram** para liberar permissões
extras de leitura de DM. Upgrade: zernio.com/dashboard/billing → "Switch to usage-based pricing".

### Payload

```json
{
  "id": "uuid-do-evento",
  "event": "message.received",
  "timestamp": "ISO-8601",
  "message": { ... },
  "conversation": { ... },
  "account": { ... },
  "metadata": { ... }
}
```

### Verificação de assinatura

- Header `X-Zernio-Signature` = HMAC-SHA256(raw body, secret) em hex minúsculo. (`X-Late-Signature` é alias legado.)
- `X-Zernio-Event-Id` = UUID do evento (igual a `payload.id`).
- Responder 2xx em < 5s; trabalho pesado vai para background.

### Retries e idempotência

- At-least-once com backoff exponencial (7 tentativas, até ~51h; depois dead-letter).
- Dedup obrigatória por `payload.id` (tabela com índice único — inserir antes de processar, ignorar conflito).

## Mídia recebida (verificado jul/2026)

- O anexo de `message.received` chega como `attachments[0].url` no formato
  `https://zernio.com/api/v1/whatsapp/media/{mediaId}?accountId=...`.
- **Essa URL exige `Authorization: Bearer` com a API key** — sem auth retorna 401
  `{"error":"Unauthorized"}`. Tags `<img>/<audio>/<video>` não enviam headers,
  então o app serve mídia via edge function `zernio-media` (proxy autenticado:
  token do usuário na query + fetch server-side com a chave; repassa `Range`).
- **A mídia EXPIRA na Zernio em poucos dias** (verificado 20/jul: 404 autenticado
  para anexos de 5 dias). Por isso o `zernio-webhook` baixa o anexo na chegada
  (background, limite 50MB) e persiste no bucket privado `chat-media`
  (`metadata.storage_path`); a `zernio-media` serve do Storage primeiro e só
  cai na Zernio quando ainda não há cópia. Mensagens anteriores ao pipeline
  ficaram irrecuperáveis.

## Limites relevantes

- WhatsApp: imagem 5MB, vídeo/áudio 16MB, documento 100MB; coex 20 msg/s.
- Instagram DM: imagem 8MB, vídeo/áudio 25MB; quick replies máx 13; botões máx 3.
- Supabase Storage é auto-proxied pela Zernio para URLs de mídia.
