# Templates de mensagem da Meta (WhatsApp Cloud)

## Por que existem

Pela política da Meta, mensagem livre só pode ser enviada até 24 horas depois da
última mensagem do cliente. Fora dessa janela — incluindo os follow-ups de 72h e
168h configuráveis na agente — apenas templates aprovados são entregues.

## Fluxo

`Configurações → Canais → Templates de mensagem` lista, cria e exclui templates
da conta WhatsApp Business (WABA) configurada na aba APIs. A criação valida
localmente (mesmas regras nos três lugares: interface, edge function e sender,
via `supabase/functions/_shared/whatsapp-templates.ts`) e envia para análise da
Meta; o status (Em análise, Aprovado, Rejeitado com motivo) vem ao vivo da Graph
API a cada atualização da lista.

Limites da primeira versão: cabeçalho e rodapé apenas de texto e sem variáveis;
sem botões; categoria AUTHENTICATION fora (exige composição própria da Meta).

## Envio

Um item de `send_queue` com `message_type = 'template'` carrega a especificação
em `metadata.template` (`{ name, language, bodyParams }`) e o texto renderizado
em `content`. O `whatsapp-sender` monta o payload `type: template` para a Meta;
no registro do chat (`messages`) o tipo é gravado como `text` com o texto
renderizado — o enum `message_type` do banco não conhece `template` e o
histórico deve mostrar o que o lead leu. Conversas roteadas via Zernio caem no
envio de texto comum (templates são um conceito do WhatsApp Cloud oficial; a
Zernio gerencia os dela).

## Requisitos externos

- `whatsapp_access_token` com a permissão `whatsapp_business_management`
  (a de envio, `whatsapp_business_messaging`, não basta para criar/excluir).
- `whatsapp_business_account_id` (WABA ID) preenchido na aba APIs.

## Deploy

Sem migrations. Subir juntas: `whatsapp-templates` (nova) e `whatsapp-sender`
(alterada), junto com o frontend.
