# Auditoria do escopo — treinamento da agente SDR

Fonte de verdade revisada: `ESPECIFICACAO-TREINAMENTO-AGENTE-SDR.md` (1.376 linhas,
recebida em 01/08/2026).

## Checklist funcional

| Requisito | Implementação | Evidência principal |
| --- | --- | --- |
| Configurações e Treinamento unificados | Atendido | `/training` redireciona para Conhecimento; editor legado removido |
| Uma agente por workspace | Atendido | `agents.workspace_id UNIQUE` |
| Nome personalizável | Atendido | Identidade e negócio |
| Rascunho, autosave e produção separados | Atendido | `useAgentDraft`, `agent_drafts`, `agents.published_version_id` |
| Versões, histórico e restauração auditada | Atendido | `agent_versions`, RPCs de publicação/restauração e histórico na UI |
| Papéis e permissão de publicação | Atendido | admin/editor/observer e `can_publish_agent` |
| Configuração inicial sem upload | Atendido | perguntas guiadas + opção manual |
| Coleta por IA com links e arquivos | Atendido | `AgentSetupAssistant` + `agent-setup-assistant` |
| Exemplos de preenchimento | Atendido | placeholders e modelos em Identidade, Vendas e assistente |
| Revisão “Foi isso que entendemos” | Atendido | confirmar, editar, incorreto, adiar e remover por seção/fato |
| IA sugere; humano confirma | Atendido | fatos e documentos sugeridos ficam inativos em `needs_review` |
| Identidade e processo comercial estruturados | Atendido | ofertas, provas sociais, etapas, campos, objeções, follow-up e mapeamentos |
| Fatos, FAQ e documentos separados | Atendido | `knowledge_facts`, documentos/chunks e telas próprias |
| PDF, DOCX, TXT, URL, CSV e XLSX | Atendido | extração local, URLs públicas e relatório de ingestão |
| Ilegível, lacuna e conflito explícitos | Atendido | relatórios e fila “Precisa da sua ajuda” |
| Ingestão idempotente | Atendido | fingerprint único por workspace |
| Ações governadas | Atendido na primeira entrega prevista | agendamento e handoff, os dois primeiros da Fase 5 |
| Pré-condição, confirmação, simulação e falha segura | Atendido | contratos editáveis + campos fixos de segurança + `agent_action_runs` |
| Simulador embutido sem efeito real | Atendido | perfis, conversa multi-turno, grounding e executor seco |
| Cenários automáticos e personalizados | Atendido | geração pelo rascunho, editor e conversão de conversa em teste |
| Gates críticos e instabilidade | Atendido | runner determinístico/qualitativo, repetição crítica e bloqueio |
| Prompt visível e somente leitura | Atendido | card e aba “Prompt e comportamento” com inspeção inline |
| Prompt editável de forma segura | Atendido | campos estruturados + instruções personalizadas; artefato compilado não é editado diretamente |
| Runtime somente na versão publicada | Atendido | orquestrador falha fechado sem prompt legado |
| Estado estruturado do lead | Atendido | `contacts.client_memory.lead_state` com unknown/inferred/confirmed/not_applicable |
| Aprendizado assistido | Atendido | sugestões deduplicadas, evidência, revisão e teste antes de publicar |
| Observabilidade | Atendido | eventos append-only por versão, modelo, fontes, ferramentas, guards, latência e erro |
| Métricas de produto e qualidade | Atendido | adoção do assistente, abandono por etapa, aplicação por IA, sugestões, bloqueios, restaurações, tempo até publicar, avaliações e latência |
| Privacidade e limites operacionais | Atendido | redação de PII, payloads limitados, rate limits persistentes e escrita de conhecimento transacional |
| Isolamento por workspace | Atendido | RLS e testes SQL transacionais |

## Limites intencionais da primeira versão

Estes itens permanecem fora porque a própria especificação os exclui: OCR garantido,
varredura de site inteiro, múltiplas agentes ativas, fine-tuning, publicação automática,
execução real no simulador e retrieval vetorial avançado sem baseline que o justifique.

As demais ações enumeradas (CRM genérico e envio de material por qualquer integração)
seguem a ordem explícita da Fase 5: agendamento e handoff são a primeira implementação
governada. Consultar disponibilidade, agendar, reagendar e cancelar já compartilham o
mesmo contrato publicado. O schema foi desenhado para ampliar o catálogo sem criar
outro sistema de configuração; integrações genéricas sem backend real não são expostas
como se estivessem funcionais.

## Validação executada

- TypeScript sem erros;
- 33 testes unitários em 8 arquivos;
- build Vite de produção;
- Deno check nas Edge Functions alteradas;
- migrations 18h e 19h validadas no PostgreSQL de produção da época dentro de `BEGIN/ROLLBACK`;
- o lote completo e ordenado de migrations 14h→22h foi executado no PostgreSQL de
  produção da época dentro de uma única transação `BEGIN/ROLLBACK`, validando também as
  dependências cruzadas, sem mutação persistente;
- migration de conhecimento + idempotência validada em conjunto no banco de produção da época;
- `npm audit`: as correções compatíveis atualizaram Router interno, Vite, Rollup,
  PostCSS, lodash e `ws`; o resultado caiu de 8 altos para 0 altos e 2 moderados. Os
  dois restantes pertencem ao React Router 6 e só são eliminados com migração de major
  para 7.18+. O app não usa hidratação SSR nem aceita destinos de navegação fornecidos
  pelo lead; a migração de major fica separada para não misturar risco funcional nesta
  entrega.

A inspeção visual da área autenticada não pôde ser concluída neste ambiente porque a
sessão do navegador local foi redirecionada para `/login`. A interface foi validada por
tipagem e build, mas a conferência visual final deve ocorrer no preview autenticado após
o deploy atômico da branch.

## Deploy

O código e as migrations devem entrar na ordem documentada em
`docs/agent-configuration.md`.

Concluído em 01/08/2026: as migrations 14h→22h foram aplicadas no banco de produção da época na
ordem documentada, a branch entrou em `main` e as 11 Edge Functions foram publicadas.
Antes do lote, também entraram as duas migrations pendentes de 31/07
(`require_waba_for_cloud_setup` e `add_rotatable_whatsapp_webhook_key`), que o banco
ainda não tinha. Conferido depois de aplicar: 43 tabelas em `public`, nenhuma sem RLS,
`workspace_id` presente nas 8 tabelas governadas, restrição de sobreposição de agenda
ativa e os 9 contatos existentes migrados para `client_memory.lead_state`.
