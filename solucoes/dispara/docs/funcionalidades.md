# Funcionalidades

Mapa do produto, tela por tela. Os caminhos são as rotas do dashboard.

## Dashboard (`/`)

Visão consolidada: contadores de campanhas, contatos e mensagens, status do número na Meta,
alertas de conta (`account_alerts`) e uso contra os limites da WABA. Alimentado por
`/api/dashboard/stats`, `/api/account/limits` e `/api/account/alerts`.

Alertas de pagamento (erro `131042`) aparecem automaticamente e se dispensam sozinhos quando
uma entrega volta a funcionar.

## Campanhas (`/campaigns`)

### Criação — wizard de 3 passos (`/campaigns/new`)

1. **Template** — escolhe o template aprovado e preenche as variáveis (corpo, cabeçalho,
   botões). Variáveis podem vir de campos do contato (`{{name}}`, campos customizados) ou
   de valor fixo.
2. **Audiência** — seleção por lista de contatos, tags, filtros de segmentação ou CSV.
   O contador de segmento (`/api/contacts/segment-count`) mostra quantos contatos o filtro
   alcança antes de confirmar.
3. **Revisão e envio** — roda o **precheck** (`/api/campaign/precheck`): um dry-run que
   valida o template no cache local, normaliza e valida cada telefone e confere as variáveis
   obrigatórias contato por contato. Nada é enviado nem persistido nesse passo. O resultado
   é humanizado (`lib/precheck-humanizer.ts`) para dizer o que está errado em português.

Daí, enviar agora ou **agendar** (o pg_cron drena na hora marcada).

### Durante o disparo

- Barra de progresso em tempo real, por broadcast do Realtime (não por polling).
- **Pausar**, **retomar** e **cancelar** (`/api/campaign/[id]/pause|resume|cancel`).
- **Teste A/B**: duas versões de template com split configurável (padrão 50/50). Cada
  linha de `campaign_contacts` guarda sua variante (`A`/`B`), e as métricas saem separadas.

### Depois

- **Métricas** por campanha: enviados, entregues, lidos, falhos, por variante.
- **Trace** (`CampaignTracePanel`): a linha do tempo de eventos da campanha — útil para
  explicar por que um contato não recebeu.
- **Relatório CSV** (`/api/campaigns/[id]/report.csv`).
- **Reenviar pulados** (`resend-skipped`): contatos que o precheck ou o envio pulou.
- **Clonar** campanha.
- **Respostas automáticas**: resposta configurada para quem responder à campanha.

### Organização

Pastas (`campaign_folders`) e tags (`campaign_tags`) com cores, filtros por ambas e ação de
mover em massa.

## Inbox (`/inbox`)

Atendimento das conversas que chegam pelo webhook.

- Lista de conversas com status (`open`/`closed`), modo (`bot`/`human`), prioridade
  (`low`/`normal`/`high`/`urgent`), não lidas e sentimento detectado
  (`positive`/`neutral`/`negative`/`frustrated`).
- Painel de mensagens com todos os tipos da Cloud API: texto, imagem, áudio, vídeo,
  documento, template, interativo — mais **notas internas** que não vão para o cliente.
- **Handoff bot → humano**: `takeover` assume a conversa, `return-to-bot` devolve,
  `pause`/`resume` suspendem o agente sem assumir.
- **Respostas rápidas** (`inbox_quick_replies`), **etiquetas** (`inbox_labels`).
- **Sugestão de resposta por IA** (`/api/inbox/suggest`).
- Acesso da PWA de atendente com permissão verificada no servidor, não só na UI.
- **Memórias do contato** (Mem0), quando configurado.
- Badge de não lidas na sidebar, atualizado por Realtime.

Retenção configurável em Configurações → Inbox.

## Atendentes (`/attendants`)

Acesso ao atendimento **sem conta de usuário**: cada atendente recebe um token com
permissões granulares (`canView`, `canReply`, `canHandoff`), validade opcional e contagem de
acessos. O atendente abre `/atendimento?token=...` e vê apenas o monitor de conversas.

Isso mantém o modelo single-tenant (nenhuma tabela de usuários) e ainda permite uma equipe
atendendo.

## Contatos (`/contacts`)

- CRUD, importação de CSV (com o limite de 20MB de Server Action), exportação.
- **Status**: `OPT_IN`, `OPT_OUT`, `UNKNOWN`.
- **Campos customizados** (`custom_fields`) definidos pelo cliente e usáveis como variável
  de template.
- **Tags** com contadores, ações em massa (tags, status, campo customizado).
- **Listas de contatos** (`contact_lists`): filtros salvos com membros dinâmicos — a lista
  reflete quem casa com o filtro agora, não um snapshot.
- Normalização para E.164 com `libphonenumber-js`; códigos de país e de estado brasileiro
  para segmentação geográfica.
- **Supressões** (`phone_suppressions`): números bloqueados para disparo, manual ou
  automaticamente.

### Supressão automática

Configurável em Configurações. O caso principal é o erro `131026` (mensagem não entregável):
após N falhas numa janela de dias, o número entra em supressão com TTL escalonado
(1ª, 2ª, 3ª ocorrência com prazos diferentes). Isso protege a qualidade do número na Meta,
que pune envio insistente para destinos inválidos.

## CRM (`/crm`)

Kanban de oportunidades.

- **Pipelines** → **etapas** → **oportunidades**.
- Cada oportunidade pertence a 1 pipeline e 1 etapa, tem valor monetário, status
  (`open`/`won`/`lost`/`abandoned`) e um contato vinculado (um contato pode ter várias).
- Arrastar entre colunas, gerenciar etapas, criar e editar pipelines.
- Um step de workflow (`crm/move-pipeline`) move a oportunidade por automação.

## Templates (`/templates`)

- **Sincronização** do cache local com a Meta.
- **Criação manual** (`ManualTemplateBuilder`) com preview fiel ao WhatsApp, incluindo
  cabeçalho de mídia, botões e rodapé.
- **Rascunhos** (`/templates/drafts`): monta, revisa e submete à Meta.
- **Geração por IA**: um template a partir de um briefing, ou **geração em lote**.
- **Projetos de template** (`template_projects`): agrupa um conjunto de templates como um
  projeto, com sincronização e status de submissão em lote.
- **Clonar** template e inspecionar **variáveis de marketing**.
- Upload de cabeçalho de mídia via upload resumable da Meta
  (`/api/meta/uploads/template-header`).
- Categorias: `MARKETING`, `UTILIDADE`, `AUTENTICACAO`.

## Workflows (`/workflows`, builder em `/builder/[id]`)

Builder visual de automação. Detalhes em [Workflows](./workflows.md).

Resumo: gatilho (palavra-chave, resposta de campanha ou nenhum) → steps de WhatsApp,
contatos e CRM, com condições e delays duráveis. Versionamento com publicar e **rollback**,
execuções com logs, métricas, webhook de entrada e download do código do fluxo.

## MiniApps / Flows (`/flows`)

WhatsApp Flows da Meta — os formulários nativos dentro da conversa.

- Builder de Flow com validação do Flow JSON (`meta-flow-json-validator`).
- Publicação na Meta (`/api/flows/[id]/meta/publish`).
- **Flow Endpoint dinâmico** com criptografia ponta a ponta: o par de chaves RSA é gerado no
  bootstrap da instalação; os handlers ficam em `lib/whatsapp/flow-endpoint-handlers.ts`.
- Envio do Flow para um contato, painel de teste, templates de Flow prontos.
- **Submissões** (`/submissions`) com exportação CSV.

## Formulários de captação (`/forms`, público em `/f/[slug]`)

Landing de formulário hospedada pelo próprio deploy, com slug público. A submissão cria ou
atualiza o contato e pode entrar num fluxo. Campos: texto, número, data, seleção.

## IA (`/settings/ai`)

Central de IA. Detalhes em [IA](./ia.md).

- **Agentes** (`/settings/ai/agents`): prompt, modelo, temperatura, debounce, RAG
  (embeddings + reranking + limiar de similaridade), handoff e permissões de ferramenta
  (reagir, citar, agendar).
- **Base de conhecimento**: upload de arquivos, indexação com status por arquivo.
- Provedores de LLM e de embedding selecionáveis (Google, OpenAI, Anthropic, Cohere,
  TogetherAI, Voyage), via Vercel AI SDK.
- **Helicone** para observabilidade de chamadas de LLM; **Mem0** para memória de conversa.
- Geração de conteúdo: extração de conteúdo de URL, geração de templates de utilidade,
  geração de formulário de fluxo, teste de estratégia.

## Integrações

### Google Calendar

OAuth, seleção de calendários, leitura de eventos e **slots livres**. Com a ferramenta de
booking habilitada, o agente de IA agenda direto na conversa. Webhook para refletir mudanças
feitas no calendário.

### Push (PWA)

Notificações web push (`/api/push/*`) para avisar de nova mensagem no inbox.

### Vercel

`/api/vercel/info` e `/api/vercel/redeploy` (admin) para ler o estado do deploy e redeployar
de dentro do app.

## Configurações (`/settings`)

| Painel | O que faz |
| --- | --- |
| Credenciais | Token, Phone ID e WABA ID da Meta; teste de conexão |
| Webhook | URL, verify token, validação e assinatura da WABA |
| Marca (whitelabel) | Nome, logo e cor primária do deploy |
| Diagnóstico Meta | Estado do número, o que falta para sair de `PENDING` |
| Performance / Turbo | Throttle de envio, concorrência, parâmetros do disparo |
| Execução de workflow | Limites e comportamento do executor |
| Supressão automática | Regras de bloqueio por falha recorrente |
| Inbox | Retenção de mensagens |
| IA | Provedores, chaves, Helicone, Mem0 |
| Agendamento | Google Calendar e janela de atendimento |
| Flow Endpoint | Chaves RSA dos MiniApps |
| Domínios | Domínios do deploy |
| Contato de teste | Número para os testes de envio |
| API Docs | Swagger UI em `/docs` |

## Whitelabel

Nome, logo e cor primária vêm da tabela `settings` (`brand_name`, `brand_logo_url`,
`brand_primary_color`), coletados no wizard. A sidebar, o login e os e-mails usam a marca do
cliente; o fallback é "Dispara" com a logo em `public/brand/logo.svg`.
