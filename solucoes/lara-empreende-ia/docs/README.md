# Documentação da Lara

Índice comentado. Comece pelo [README da solução](../README.md) para stack, instalação
e deploy.

## Entender o produto

- [**arquitetura.md**](arquitetura.md) — camadas, fluxo de uma mensagem do webhook até a
  resposta, o que cada uma das 24 edge functions faz, as 42 tabelas por domínio, as
  ferramentas que a agente pode chamar e os pontos de isolamento (RLS, workspace, Vault).
- [**agent-configuration.md**](agent-configuration.md) — o ciclo governado de
  configuração: rascunho com autosave, prompt compilado somente leitura, avaliação
  obrigatória, publicação imutável, aprendizado assistido e privacidade.
- [**agent-configuration-scope-audit.md**](agent-configuration-scope-audit.md) —
  auditoria do escopo contra a especificação de treinamento recebida em 01/08/2026:
  o que entrou, o que ficou fora e por quê.

## Operar

- [**operacao.md**](operacao.md) — runbook: deploy na ordem certa, secrets, rotinas de
  varredura, checagem de saúde, o que olhar quando a Lara para de responder.
- [**plano-de-testes.md**](plano-de-testes.md) — plano dos testes automatizados
  (22 suítes Vitest no front/domínio e 10 testes SQL transacionais).

## Integrações

- [**zernio-api.md**](zernio-api.md) — API Zernio: WhatsApp por coexistência e
  Instagram DM, assinatura HMAC do webhook, envio e mídia.
- [**whatsapp-templates.md**](whatsapp-templates.md) — templates da Meta Cloud API:
  por que existem e quando a Lara precisa de um para reabrir conversa.
- [**nylas-calendar.md**](nylas-calendar.md) — agenda via Nylas v3 (Google, Outlook,
  iCloud): OAuth hospedado, secrets e o contrato de eventos.

## Interface

- [**design-tokens.md**](design-tokens.md) — como o design system Empreende.IA entra no
  painel da Lara e o que não deve ser adaptado localmente.
